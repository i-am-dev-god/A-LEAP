package com.offline.shortsmanager;

import android.app.Activity;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/**
 * A thin Android companion, not a Python runtime. The UI is bundled in the APK;
 * media and API requests go to the user's backend. Completed MP4s and metadata
 * snapshots are stored in app-private storage and remain usable with no network.
 */
public class MainActivity extends Activity {
    private static final String HOST = "offline.shorts.local";
    private static final String ORIGIN = "https://" + HOST;
    private WebView web;
    private OfflineStore store;
    private final ExecutorService io = Executors.newFixedThreadPool(3);

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        store = new OfflineStore(getFilesDir(), getSharedPreferences("connection", MODE_PRIVATE));
        web = new WebView(this);
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " OfflineShortsAndroid/1.1");
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!HOST.equals(uri.getHost())) return error(403, "Blocked external navigation");
                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                try {
                    if (path.startsWith("/media/")) return store.media(path, request.getRequestHeaders().get("Range"));
                    if (path.startsWith("/api/avatars/")) return store.avatar(path);
                    if (path.startsWith("/api/")) return error(400, "Use the native API bridge");
                    String asset = "www" + path;
                    String mime = mime(asset);
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", securityHeaders(), getAssets().open(asset));
                } catch (IOException e) {
                    return error(404, "Bundled asset not found");
                } catch (Exception e) {
                    return error(503, "Backend unavailable; cached media is still accessible");
                }
            }
        });
        web.loadUrl(ORIGIN + "/index.html");
    }

    private static Map<String,String> securityHeaders() {
        Map<String,String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", ORIGIN);
        h.put("X-Content-Type-Options", "nosniff");
        h.put("Cache-Control", "no-cache");
        return h;
    }
    private static WebResourceResponse error(int code, String message) {
        return new WebResourceResponse("application/json", "UTF-8", code, "Error", securityHeaders(),
            new ByteArrayInputStream(("{\"detail\":\"" + message + "\"}").getBytes(StandardCharsets.UTF_8)));
    }
    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        if (path.endsWith(".mp4")) return "video/mp4";
        return "application/octet-stream";
    }

    private class Bridge {
        @JavascriptInterface public String getBackend() { return store.backend(); }
        @JavascriptInterface public void setBackend(String value) { store.setBackend(value); }
        @JavascriptInterface public void setCacheLimit(String bytes) { store.setLimit(Long.parseLong(bytes)); }
        @JavascriptInterface public String cachedIds() { return store.cachedIds(); }
        @JavascriptInterface public void deleteCached(String id) { store.delete(id); }
        @JavascriptInterface public String cacheUsage() { return String.valueOf(store.usage()); }
        @JavascriptInterface public void apiRequest(final String callbackId, final String method,
                final String path, final String body, final String token) {
            io.execute(new Runnable() { @Override public void run() {
                String result;
                try { result = store.api(method, path, body, token).toString(); }
                catch (Exception e) {
                    try { result = new JSONObject().put("status",500).put("body",new JSONObject().put("detail",e.getMessage()).toString()).toString(); }
                    catch (Exception ignored) { result = "{\"status\":500,\"body\":\"{}\"}"; }
                }
                final String js = "window.__nativeApiResult(" + JSONObject.quote(callbackId) + "," + JSONObject.quote(result) + ");";
                runOnUiThread(new Runnable() { @Override public void run() { if (web != null) web.evaluateJavascript(js, null); } });
            } });
        }
    }

    @Override public void onBackPressed() {
        if (web != null) web.evaluateJavascript("if(location.hash!=='#feed'){showPage('feed')}else{history.back()}", null);
    }
    @Override protected void onPause() { if (web != null) web.evaluateJavascript("document.querySelectorAll('video').forEach(v=>v.pause())", null); super.onPause(); }
    @Override protected void onDestroy() { io.shutdownNow(); if (web != null) { web.removeJavascriptInterface("AndroidBridge"); web.destroy(); } super.onDestroy(); }

    private static class OfflineStore {
        private final File root, media, snapshots, avatars;
        private final SharedPreferences prefs;
        private final ConcurrentHashMap<String,Object> locks = new ConcurrentHashMap<>();
        private final Set<String> cancelled = ConcurrentHashMap.newKeySet();
        OfflineStore(File files, SharedPreferences prefs) {
            root = new File(files, "offline"); media = new File(root, "media");
            snapshots = new File(root, "snapshots"); avatars = new File(root, "avatars");
            media.mkdirs(); snapshots.mkdirs(); avatars.mkdirs(); this.prefs = prefs;
        }
        String backend() { return prefs.getString("backend", ""); }
        void setBackend(String value) {
            try { URL u = new URL(value); if (!u.getProtocol().equals("https") && !u.getProtocol().equals("http")) throw new Exception(); prefs.edit().putString("backend", value.replaceAll("/+$", "")).apply(); }
            catch (Exception ignored) {}
        }
        void setLimit(long value) { prefs.edit().putLong("limit", Math.max(104857600, value)).apply(); }
        long usage() { long n=0; File[] fs=media.listFiles(); if(fs!=null) for(File f:fs) if(f.isFile()) n+=f.length(); return n; }
        private static String videoId(String path) {
            String id=path.substring(path.lastIndexOf('/')+1); if(id.endsWith(".mp4")) id=id.substring(0,id.length()-4);
            if(!id.matches("[A-Za-z0-9_-]{6,80}")) throw new IllegalArgumentException("Invalid video ID"); return id;
        }
        String cachedIds() {
            JSONArray ids=new JSONArray(); File[] fs=media.listFiles();
            if(fs!=null) for(File f:fs) if(f.isFile()&&f.getName().endsWith(".mp4")) ids.put(f.getName().substring(0,f.getName().length()-4));
            return ids.toString();
        }
        void delete(String id) {
            if(!id.matches("[A-Za-z0-9_-]{6,80}")) return;
            // Never wait for a network transfer: cancel it and unlink the local copy now.
            cancelled.add(id); new File(media,id+".mp4").delete(); new File(media,id+".part").delete();
        }
        private Object lock(String key) { Object value=new Object(); Object old=locks.putIfAbsent(key,value); return old==null?value:old; }
        private HttpURLConnection open(String path, String method, String token) throws IOException {
            String base=backend(); if(base.isEmpty()) throw new IOException("Connect your backend in Settings first");
            HttpURLConnection c=(HttpURLConnection)new URL(base+path).openConnection();
            c.setRequestMethod(method); c.setConnectTimeout(15000); c.setReadTimeout(600000);
            c.setInstanceFollowRedirects(false); c.setRequestProperty("Accept","application/json, video/mp4, image/jpeg");
            if(token!=null&&!token.isEmpty()) c.setRequestProperty("X-Shorts-Token",token);
            return c;
        }
        JSONObject api(String method, String path, String body, String token) throws Exception {
            if(!path.startsWith("/api/")||path.contains("..")) throw new IOException("Invalid API path");
            lastToken = token == null ? "" : token;
            prefs.edit().putString("token", lastToken).apply();
            boolean get=method.equals("GET");
            try {
                HttpURLConnection c=open(path,method,token);
                try {
                    if(!get) { c.setDoOutput(true); c.setRequestProperty("Content-Type","application/json"); byte[] data=(body==null?"{}":body).getBytes(StandardCharsets.UTF_8); c.setFixedLengthStreamingMode(data.length); try(OutputStream out=c.getOutputStream()){out.write(data);} }
                    int status=c.getResponseCode(); String text=read(c,status);
                    if(get&&status==200&&isSnapshot(path)) atomicWrite(new File(snapshots,snapshotName(path)),text.getBytes(StandardCharsets.UTF_8));
                    return new JSONObject().put("status",status).put("body",text).put("offline",false);
                } finally { c.disconnect(); }
            } catch(IOException network) {
                // Serve the last successful metadata snapshot even when the server is offline.
                if(get&&isSnapshot(path)) { File f=new File(snapshots,snapshotName(path)); if(f.isFile()) return new JSONObject().put("status",200).put("body",readFile(f)).put("offline",true); }
                return new JSONObject().put("status",503).put("body","{\"detail\":\"Backend unreachable\"}").put("offline",true);
            }
        }
        private static boolean isSnapshot(String p) { return p.equals("/api/feed")||p.equals("/api/settings")||p.equals("/api/status")||p.equals("/api/queue")||p.equals("/api/history"); }
        private static String snapshotName(String p) { return p.substring(p.lastIndexOf('/')+1)+".json"; }
        private static String read(InputStream in) throws IOException { ByteArrayOutputStream out=new ByteArrayOutputStream(); byte[] b=new byte[8192]; int n; while((n=in.read(b))!=-1) out.write(b,0,n); return out.toString("UTF-8"); }
        private static String read(HttpURLConnection c,int status) throws IOException { InputStream in=status>=400?c.getErrorStream():c.getInputStream(); return in==null?"{}":read(in); }
        private static String readFile(File f) throws IOException { try(FileInputStream in=new FileInputStream(f)){return read(in);} }
        private static void atomicWrite(File target, byte[] data) throws IOException { File tmp=new File(target.getPath()+".tmp"); try(FileOutputStream out=new FileOutputStream(tmp)){out.write(data);} if(!tmp.renameTo(target)) {tmp.delete();throw new IOException("Could not commit cache file");} }
        private void trim(String keep) {
            long limit=prefs.getLong("limit",1073741824L); File[] fs=media.listFiles(); if(fs==null)return;
            List<File> files=new ArrayList<>(); for(File f:fs) if(f.isFile()&&f.getName().endsWith(".mp4")&&!f.getName().equals(keep+".mp4")) files.add(f);
            Collections.sort(files, new Comparator<File>() { @Override public int compare(File a, File b) { return Long.compare(a.lastModified(), b.lastModified()); } }); long used=usage();
            for(File f:files){if(used<=limit)break;long n=f.length();if(f.delete())used-=n;}
        }
        WebResourceResponse media(String path,String range) throws Exception {
            final String id=videoId(path); File file=new File(media,id+".mp4");
            synchronized(lock(id)) {
                if(!file.isFile()) {
                    cancelled.remove(id);
                    HttpURLConnection c=open(path,"GET",prefs.getString("token",""));
                    File part=new File(media,id+".part");
                    try { if(c.getResponseCode()!=200) throw new IOException("Video is not available ("+c.getResponseCode()+")");
                        try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(part)){byte[]b=new byte[65536];int n;while((n=in.read(b))!=-1){if(cancelled.contains(id))throw new InterruptedIOException("Video deleted");out.write(b,0,n);}}
                        if(cancelled.contains(id)){part.delete();throw new InterruptedIOException("Video deleted");}
                        if(!part.renameTo(file)){part.delete();throw new IOException("Cache commit failed");}
                        if(cancelled.contains(id)){file.delete();throw new InterruptedIOException("Video deleted");}
                        file.setLastModified(System.currentTimeMillis()); trim(id);
                    } catch(IOException e){part.delete();throw e;} finally{c.disconnect();}
                }
                file.setLastModified(System.currentTimeMillis());
                long size=file.length(),start=0,end=size-1; boolean partial=range!=null&&range.startsWith("bytes=");
                if(partial){String[] parts=range.substring(6).split("-",2);if(parts[0].isEmpty()){start=Math.max(0,size-Long.parseLong(parts[1]));}else{start=Long.parseLong(parts[0]);if(parts.length>1&&!parts[1].isEmpty())end=Math.min(end,Long.parseLong(parts[1]));}if(start>=size||start>end)return new WebResourceResponse("video/mp4","UTF-8",416,"Range Not Satisfiable",securityHeaders(),new ByteArrayInputStream(new byte[0]));}
                FileInputStream in=new FileInputStream(file); long skipped=0; while(skipped<start){long n=in.skip(start-skipped);if(n<=0)break;skipped+=n;}
                Map<String,String> h=securityHeaders();h.put("Accept-Ranges","bytes");h.put("Content-Length",String.valueOf(end-start+1));h.put("Cache-Control","private, max-age=31536000, immutable");
                if(partial)h.put("Content-Range","bytes "+start+"-"+end+"/"+size);
                return new WebResourceResponse("video/mp4",null,partial?206:200,"OK",h,new LimitedInputStream(in,end-start+1));
            }
        }
        private volatile String lastToken="";
        WebResourceResponse avatar(String path) throws Exception {
            String name=path.substring(path.lastIndexOf('/')+1);if(!name.matches("[A-Za-z0-9_-]{1,80}\\.jpg"))throw new IOException("Invalid avatar");
            File f=new File(avatars,name);if(!f.isFile()){HttpURLConnection c=open(path,"GET",lastToken);try{if(c.getResponseCode()==200){try(InputStream in=c.getInputStream()){ByteArrayOutputStream out=new ByteArrayOutputStream();byte[]b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);atomicWrite(f,out.toByteArray());}}}finally{c.disconnect();}}
            return new WebResourceResponse("image/jpeg",null,200,"OK",securityHeaders(),new FileInputStream(f));
        }

    }
    private static class LimitedInputStream extends FilterInputStream {
        private long remaining; LimitedInputStream(InputStream in,long n){super(in);remaining=n;}
        @Override public int read() throws IOException {if(remaining<=0)return -1;int v=super.read();if(v>=0)remaining--;return v;}
        @Override public int read(byte[] b,int off,int len) throws IOException {if(remaining<=0)return -1;int n=super.read(b,off,(int)Math.min(len,remaining));if(n>0)remaining-=n;return n;}
        @Override public int available() throws IOException {return (int)Math.min(super.available(),remaining);}
    }
}
