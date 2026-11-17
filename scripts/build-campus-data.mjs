/**
 * OU SPATIAL ENGINE — campus geospatial data compiler
 * ------------------------------------------------------------------
 * Generates 100% self-authored, self-hosted GeoJSON for the Osmania
 * University campus core (no third-party map APIs or tile services).
 *
 * Coordinate frame: local tangent plane in metres, x = east, y = north,
 * anchored at the campus datum 17.4175 N, 78.5285 E (Hyderabad).
 *
 * Run: npm run data:build
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../src/data');

const DATUM = { lng: 78.5285, lat: 17.4175 };
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos((DATUM.lat * Math.PI) / 180);

const R6 = (v) => Math.round(v * 1e6) / 1e6;
const R1 = (v) => Math.round(v * 10) / 10;
const toLngLat = (x, y) => [R6(DATUM.lng + x / M_PER_DEG_LNG), R6(DATUM.lat + y / M_PER_DEG_LAT)];

/** Smooth synthetic terrain — the OU ridge falls gently toward the south-east. */
function elev(x, y) {
  const a = 4.2 * Math.sin((x + 260) / 640) * Math.cos((y - 140) / 520);
  const b = 2.4 * Math.exp(-(((x - 470) ** 2 + (y - 260) ** 2) / (2 * 300 ** 2)));
  const c = 1.1 * Math.sin(x / 190) * Math.sin(y / 230);
  return R1(7.5 + a + b + c);
}

// deterministic RNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261117);

// ────────────────────────────────────────────────────────────── nodes ──
/** @type {Record<string, {x:number,y:number,label:string,kind:string}>} */
const NODES = {
  rrN: { x: 0, y: 215, label: 'Arts College Ring — North', kind: 'plaza' },
  rrNE: { x: 152, y: 152, label: 'Arts College Ring — North East', kind: 'junction' },
  rrE: { x: 215, y: 0, label: 'Arts College Ring — East', kind: 'junction' },
  rrSE: { x: 152, y: -152, label: 'Arts College Ring — South East', kind: 'junction' },
  rrS: { x: 0, y: -215, label: 'Arts College Ring — South', kind: 'junction' },
  rrSW: { x: -152, y: -152, label: 'Arts College Ring — South West', kind: 'junction' },
  rrW: { x: -215, y: 0, label: 'Arts College Ring — West', kind: 'junction' },
  rrNW: { x: -152, y: 152, label: 'Arts College Ring — North West', kind: 'junction' },

  fountain: { x: 0, y: -112, label: 'Fountain Plaza', kind: 'plaza' },
  artsN: { x: 0, y: 46, label: 'Arts College North Portico', kind: 'plaza' },
  libPlaza: { x: -118, y: -188, label: 'Library Plaza', kind: 'plaza' },
  canteenFront: { x: 150, y: -122, label: 'Students Centre Walk', kind: 'junction' },
  masjidForecourt: { x: 118, y: 44, label: 'Masjid Forecourt', kind: 'plaza' },
  convocationFront: { x: 285, y: 95, label: 'Convocation Esplanade', kind: 'plaza' },

  northPlaza: { x: 0, y: 300, label: 'North Plaza', kind: 'plaza' },
  northJunction: { x: -70, y: 470, label: 'North Hostel Road', kind: 'junction' },
  northGate: { x: 0, y: 780, label: 'North Gate', kind: 'gate' },
  nePlaza: { x: 640, y: 570, label: 'North East Boulevard', kind: 'junction' },

  hostelJunction: { x: -390, y: 400, label: 'Hostel Circle', kind: 'junction' },
  nizamFront: { x: -540, y: 420, label: 'Nizam Hostel Forecourt', kind: 'junction' },
  girlsFront: { x: -340, y: 470, label: 'Girls Hostel Approach', kind: 'junction' },
  pgFront: { x: -660, y: 330, label: 'PG Hostel Lane', kind: 'junction' },
  intlFront: { x: -250, y: 620, label: 'International House Walk', kind: 'junction' },
  westGate: { x: -960, y: 360, label: 'West Gate', kind: 'gate' },
  facultyFront: { x: -860, y: 150, label: 'Faculty Quarters Lane', kind: 'junction' },

  scienceFront: { x: -395, y: 20, label: 'Science College Forecourt', kind: 'plaza' },
  scienceGate: { x: -700, y: -280, label: 'Science Gate', kind: 'gate' },
  guestFront: { x: -660, y: -55, label: 'Guest House Drive', kind: 'junction' },

  commerceFront: { x: -280, y: -330, label: 'Commerce Forecourt', kind: 'plaza' },
  healthFront: { x: -380, y: -500, label: 'Health Centre Approach', kind: 'junction' },
  botGarden: { x: -360, y: -670, label: 'Botanical Garden Gate', kind: 'junction' },
  gatePlaza: { x: -120, y: -640, label: 'Main Gate Plaza', kind: 'plaza' },
  mainGate: { x: -120, y: -780, label: 'Main Gate', kind: 'gate' },

  examFront: { x: -90, y: -455, label: 'Examination Branch Walk', kind: 'junction' },
  adminFront: { x: 100, y: -380, label: 'Administration Forecourt', kind: 'plaza' },
  lawFront: { x: 250, y: -280, label: 'Law College Walk', kind: 'junction' },

  ouceFront: { x: 470, y: -120, label: 'OUCE Plaza', kind: 'plaza' },
  engineJunction: { x: 470, y: -320, label: 'Engineering South Road', kind: 'junction' },
  biotechFront: { x: 660, y: 60, label: 'Biotech Walk', kind: 'junction' },
  eastGate: { x: 900, y: 0, label: 'East Gate', kind: 'gate' },
  lakeEdge: { x: 790, y: -430, label: 'Lakeside Promenade', kind: 'junction' },

  sportsJunction: { x: 440, y: 255, label: 'Sports Complex Junction', kind: 'junction' },
  sportsFront: { x: 520, y: 205, label: 'Sports Complex Forecourt', kind: 'plaza' },
  cricketJunction: { x: 540, y: 470, label: 'Cricket Ground Approach', kind: 'junction' },
};

const NODE = (id) => {
  const n = NODES[id];
  if (!n) throw new Error(`Unknown node: ${id}`);
  return n;
};

// ──────────────────────────────────────────────────────── building defs ──
const BUILDINGS = [
  {
    id: 'artscollege', name: 'Arts College', short: 'ARTS', code: 'OU-01', category: 'heritage',
    cx: 0, cy: 0, w: 132, d: 48, rot: 8, floors: 2, height: 17, hero: 'arts', entranceSide: 's', hub: 'fountain',
    aliases: ['arts', 'arts college', 'daira', 'main building', 'heritage', 'history', 'english', 'telugu'],
    hours: '08:00 – 20:00', access: 'Main portico (south) · north portico step-free',
    description: 'The 1939 Osmania Arts College — a fusion of Indo-Saracenic and Osmanian architecture, crowned by the great dome that anchors the campus axis.',
    pois: [
      { name: 'Department of English', floor: 0, kind: 'office' },
      { name: 'Department of History', floor: 0, kind: 'office' },
      { name: 'Daira-e-Urdu Hall', floor: 1, kind: 'room' },
      { name: 'Arts Auditorium', floor: 1, kind: 'facility' },
    ],
  },
  {
    id: 'library', name: 'Dr. Zakir Husain Library', short: 'LIB', code: 'OU-02', category: 'library',
    cx: -120, cy: -250, w: 64, d: 44, rot: -6, floors: 4, height: 20, hero: 'library', entranceSide: 'n', hub: 'libPlaza',
    aliases: ['library', 'zakir husain', 'central library', 'study', 'reading hall', 'seats', 'books', 'manuscripts'],
    hours: '07:30 – 23:00', access: 'North stair · ramp via east annexe',
    description: 'The campus knowledge core: four stack floors, a daylight reading atrium and 24-hour exam-season study zones.',
    pois: [
      { name: 'Reading Hall', floor: 1, kind: 'facility' },
      { name: 'Digital Resource Zone', floor: 2, kind: 'lab' },
      { name: 'Rare Manuscripts Archive', floor: 3, kind: 'facility' },
      { name: 'Thesis Repository', floor: 4, kind: 'facility' },
      { name: 'Discussion Pods', floor: 2, kind: 'room' },
    ],
  },
  {
    id: 'masjid', name: 'Jama Masjid, OU', short: 'MSJ', code: 'OU-03', category: 'worship',
    cx: 118, cy: 72, w: 30, d: 30, rot: 8, floors: 1, height: 13, hero: 'mosque', entranceSide: 's', hub: 'masjidForecourt',
    aliases: ['mosque', 'masjid', 'jama masjid', 'prayer', 'namaaz'],
    hours: '05:00 – 22:00', access: 'Forecourt steps · wudu plaza',
    description: 'The campus mosque on the north-east axis of the Arts College, its dome and slim minarets visible across the quadrangle.',
    pois: [{ name: 'Prayer Hall', floor: 0, kind: 'facility' }, { name: 'Wudu Plaza', floor: 0, kind: 'facility' }],
  },
  {
    id: 'convocation', name: 'Convocation Hall', short: 'CNV', code: 'OU-04', category: 'events',
    cx: 300, cy: 155, w: 66, d: 44, rot: -12, floors: 2, height: 15, hero: 'hall', entranceSide: 's', hub: 'convocationFront',
    aliases: ['convocation', 'auditorium', 'centenary', 'graduation', 'events'],
    hours: 'By event · 10:00 – 22:00', access: 'Esplanade ramp (step-free)',
    description: 'Convocation hall and centenary auditorium — the ceremonial heart of the university, seating 1,400.',
    pois: [
      { name: 'Main Auditorium', floor: 0, kind: 'facility' },
      { name: 'Banquet Gallery', floor: 1, kind: 'facility' },
    ],
  },
  {
    id: 'ouce', name: 'University College of Engineering', short: 'OUCE', code: 'OU-05', category: 'academic',
    cx: 500, cy: -200, w: 132, d: 74, rot: -8, floors: 4, height: 19, hero: 'ouce', entranceSide: 'n', hub: 'ouceFront',
    aliases: ['engineering', 'ouce', 'engineering college', 'cse', 'ece', 'mech', 'civil', 'mtech', 'btech', 'placement'],
    hours: '08:00 – 21:00', access: 'North plaza entry · lifts to all floors',
    description: 'OUCE — the engineering flagship. Four floors of studios, fabrication bays and the central computing facility.',
    pois: [
      { name: 'CSE Seminar Hall', floor: 3, kind: 'room' },
      { name: 'Robotics & Automation Lab', floor: 1, kind: 'lab' },
      { name: 'Central Computing Facility', floor: 2, kind: 'lab' },
      { name: 'Mechanical Workshop', floor: 0, kind: 'facility' },
      { name: 'ECE Signal Processing Lab', floor: 2, kind: 'lab' },
      { name: 'Training & Placement Cell', floor: 3, kind: 'office' },
    ],
  },
  {
    id: 'ouce-b', name: 'OUCE — Block B (Computer Science)', short: 'OUCE-B', code: 'OU-06', category: 'academic',
    cx: 640, cy: -95, w: 54, d: 40, rot: -8, floors: 3, height: 14, hero: null, entranceSide: 'w', hub: 'ouceFront',
    aliases: ['block b', 'cse block', 'computer science', 'it', 'software'],
    hours: '08:00 – 21:00', access: 'West entry from OUCE plaza',
    description: 'The newer CSE block: software engineering studios and the AI/ML research cluster.',
    pois: [
      { name: 'AI/ML Research Lab', floor: 2, kind: 'lab' },
      { name: 'Software Engineering Studio', floor: 1, kind: 'room' },
      { name: 'Server Room', floor: 0, kind: 'facility' },
    ],
  },
  {
    id: 'science', name: 'University College of Science', short: 'SCI', code: 'OU-07', category: 'academic',
    cx: -400, cy: 100, w: 104, d: 64, rot: 6, floors: 3, height: 17, hero: 'science', entranceSide: 's', hub: 'scienceFront',
    aliases: ['science', 'science college', 'physics', 'chemistry', 'maths', 'botany', 'zoology', 'statistics'],
    hours: '08:00 – 20:00', access: 'South forecourt · step-free',
    description: 'College of Science — physics, chemistry, mathematics and the life sciences, wrapped around an open central court.',
    pois: [
      { name: 'Physics Lecture Theatre', floor: 1, kind: 'room' },
      { name: 'Analytical Chemistry Lab', floor: 2, kind: 'lab' },
      { name: 'Mathematics Seminar Room', floor: 0, kind: 'room' },
      { name: 'Botany Museum', floor: 1, kind: 'facility' },
    ],
  },
  {
    id: 'science-annexe', name: 'Science College — Research Annexe', short: 'SCI-A', code: 'OU-08', category: 'research',
    cx: -480, cy: -40, w: 48, d: 32, rot: 6, floors: 2, height: 10, hero: null, entranceSide: 'e', hub: 'scienceFront',
    aliases: ['research annexe', 'science research', 'labs'],
    hours: '09:00 – 19:00', access: 'East annexe door',
    description: 'Instrumentation and sponsored-research annexe serving the science faculty.',
    pois: [{ name: 'Instrumentation Lab', floor: 1, kind: 'lab' }, { name: 'Research Scholars Room', floor: 0, kind: 'room' }],
  },
  {
    id: 'commerce', name: 'College of Commerce & Business Management', short: 'CBM', code: 'OU-09', category: 'academic',
    cx: -290, cy: -390, w: 58, d: 40, rot: -8, floors: 3, height: 15, hero: null, entranceSide: 'n', hub: 'commerceFront',
    aliases: ['commerce', 'business', 'management', 'mba', 'bcom', 'cbm'],
    hours: '08:30 – 20:00', access: 'North forecourt',
    description: 'Commerce and business management, with the campus trading-floor simulation room.',
    pois: [
      { name: 'MBA Seminar Hall', floor: 2, kind: 'room' },
      { name: 'Trading Floor Simulation Lab', floor: 1, kind: 'lab' },
      { name: 'Commerce Library Annexe', floor: 0, kind: 'facility' },
    ],
  },
  {
    id: 'law', name: 'College of Law', short: 'LAW', code: 'OU-10', category: 'academic',
    cx: 270, cy: -330, w: 56, d: 38, rot: 10, floors: 3, height: 14, hero: null, entranceSide: 'n', hub: 'lawFront',
    aliases: ['law', 'law college', 'legal', 'moot court', 'llb'],
    hours: '08:00 – 19:00', access: 'North entry',
    description: 'College of Law, home of the OU moot court and the legal aid clinic.',
    pois: [
      { name: 'Moot Court Hall', floor: 1, kind: 'facility' },
      { name: 'Legal Aid Clinic', floor: 0, kind: 'office' },
    ],
  },
  {
    id: 'education', name: 'Institute of Education & Research', short: 'IER', code: 'OU-11', category: 'academic',
    cx: -760, cy: 215, w: 52, d: 34, rot: 0, floors: 2, height: 11, hero: null, entranceSide: 'e', hub: 'facultyFront',
    aliases: ['education', 'ier', 'teacher training', 'bed', 'med'],
    hours: '08:30 – 18:00', access: 'East entry from faculty lane',
    description: 'Teacher education, curriculum research and the campus demonstration school.',
    pois: [{ name: 'Curriculum Lab', floor: 1, kind: 'lab' }, { name: 'Demonstration Classroom', floor: 0, kind: 'room' }],
  },
  {
    id: 'admin', name: 'Administrative Building', short: 'ADM', code: 'OU-12', category: 'admin',
    cx: 95, cy: -430, w: 64, d: 42, rot: 0, floors: 3, height: 16, hero: null, entranceSide: 'n', hub: 'adminFront',
    aliases: ['admin', 'administration', 'registrar', 'vice chancellor', 'vc office', 'accounts'],
    hours: '09:30 – 17:30', access: 'North forecourt · step-free',
    description: 'Registrar, finance and vice-chancellor offices — the administrative command of the campus.',
    pois: [
      { name: "Registrar's Office", floor: 1, kind: 'office' },
      { name: 'Vice-Chancellor Secretariat', floor: 2, kind: 'office' },
      { name: 'Accounts & Fees Counter', floor: 0, kind: 'facility' },
    ],
  },
  {
    id: 'exam', name: 'Examination Branch', short: 'EXM', code: 'OU-13', category: 'admin',
    cx: -90, cy: -500, w: 74, d: 40, rot: 0, floors: 2, height: 12, hero: null, entranceSide: 'n', hub: 'examFront',
    aliases: ['exam', 'examination', 'results', 'hall ticket', 'transcripts', 'marks memo'],
    hours: '09:30 – 17:00', access: 'North entry',
    description: 'Examination branch — hall tickets, transcripts, revaluation and degree verification.',
    pois: [
      { name: 'Results Counter', floor: 0, kind: 'facility' },
      { name: 'Transcripts Desk', floor: 1, kind: 'office' },
    ],
  },
  {
    id: 'health', name: 'University Health Centre', short: 'HLT', code: 'OU-14', category: 'health',
    cx: -380, cy: -530, w: 46, d: 34, rot: 0, floors: 2, height: 9, hero: null, entranceSide: 'n', hub: 'healthFront',
    aliases: ['health', 'hospital', 'clinic', 'medical', 'doctor', 'ambulance', 'pharmacy'],
    hours: '24 × 7', access: 'North entrance · ambulance bay',
    description: 'Round-the-clock campus health centre with ambulance bay and pharmacy.',
    pois: [
      { name: 'OPD & Consultation', floor: 0, kind: 'facility' },
      { name: 'Pharmacy', floor: 0, kind: 'facility' },
      { name: 'Observation Ward', floor: 1, kind: 'facility' },
    ],
  },
  {
    id: 'canteen', name: "Students' Centre & Canteen", short: 'STC', code: 'OU-15', category: 'amenity',
    cx: 150, cy: -90, w: 46, d: 28, rot: 0, floors: 2, height: 10, hero: null, entranceSide: 's', hub: 'canteenFront',
    aliases: ['canteen', 'food', 'mess', 'students centre', 'coffee', 'snacks', 'chai'],
    hours: '07:00 – 23:00', access: 'South terrace · step-free',
    description: 'Student centre, canteen and the rooftop chai terrace overlooking the ring promenade.',
    pois: [
      { name: 'Main Canteen', floor: 0, kind: 'facility' },
      { name: 'Chai Terrace', floor: 1, kind: 'facility' },
      { name: 'Student Clubs Hub', floor: 1, kind: 'room' },
    ],
  },
  {
    id: 'sports', name: 'Indoor Sports Complex', short: 'SPT', code: 'OU-16', category: 'sports',
    cx: 600, cy: 240, w: 96, d: 64, rot: -6, floors: 2, height: 16, hero: 'sports', entranceSide: 'w', hub: 'sportsFront',
    aliases: ['sports', 'gym', 'badminton', 'basketball', 'indoor', 'fitness', 'gymnasium'],
    hours: '06:00 – 22:00', access: 'West forecourt · step-free',
    description: 'Indoor arena for badminton, basketball and volleyball, with a strength & conditioning gym.',
    pois: [
      { name: 'Badminton Courts', floor: 0, kind: 'facility' },
      { name: 'Strength & Conditioning Gym', floor: 1, kind: 'facility' },
      { name: 'Basketball Arena', floor: 0, kind: 'facility' },
    ],
  },
  {
    id: 'cricket', name: 'Cricket Pavilion', short: 'CRK', code: 'OU-17', category: 'sports',
    cx: 600, cy: 440, w: 46, d: 30, rot: 0, floors: 1, height: 7, hero: null, entranceSide: 's', hub: 'cricketJunction',
    aliases: ['cricket', 'pavilion', 'ground', 'nets', 'athletics'],
    hours: '06:00 – 19:00', access: 'South gate to the ground',
    description: 'Pavilion and changing rooms for the OU cricket ground and athletics track.',
    pois: [{ name: 'Pavilion Lounge', floor: 0, kind: 'facility' }, { name: 'Practice Nets', floor: 0, kind: 'facility' }],
  },
  {
    id: 'nizam', name: 'Nizam Hostel', short: 'NZM', code: 'OU-18', category: 'hostel',
    cx: -540, cy: 470, w: 84, d: 42, rot: 4, floors: 4, height: 14, hero: null, entranceSide: 's', hub: 'nizamFront',
    aliases: ['nizam hostel', 'boys hostel', 'hostel', 'accommodation', 'warden'],
    hours: 'Open 24 × 7 · gate curfew 23:30', access: 'South porch',
    description: 'Historic men’s hostel with 420 beds, dining hall and the hostel reading room.',
    pois: [
      { name: 'Hostel Office', floor: 0, kind: 'office' },
      { name: 'Dining Hall', floor: 0, kind: 'facility' },
      { name: 'Reading Room', floor: 2, kind: 'room' },
    ],
  },
  {
    id: 'girls', name: 'Osmania Girls Hostel', short: 'GHS', code: 'OU-19', category: 'hostel',
    cx: -340, cy: 520, w: 72, d: 38, rot: 0, floors: 4, height: 14, hero: null, entranceSide: 's', hub: 'girlsFront',
    aliases: ['girls hostel', 'women hostel', 'hostel', 'accommodation'],
    hours: 'Open 24 × 7 · gate curfew 22:30', access: 'South entry, security desk',
    description: 'Women’s hostel with 360 beds, common rooms and a dedicated study wing.',
    pois: [{ name: 'Warden Office', floor: 0, kind: 'office' }, { name: 'Study Wing', floor: 3, kind: 'room' }],
  },
  {
    id: 'pg', name: 'PG & Research Hostel', short: 'PGR', code: 'OU-20', category: 'hostel',
    cx: -700, cy: 350, w: 62, d: 36, rot: 0, floors: 4, height: 13, hero: null, entranceSide: 'e', hub: 'pgFront',
    aliases: ['pg hostel', 'research hostel', 'hostel', 'scholars'],
    hours: 'Open 24 × 7', access: 'East entry',
    description: 'Post-graduate and research scholars’ hostel with quiet-study floors.',
    pois: [{ name: 'Scholars Common Room', floor: 1, kind: 'room' }],
  },
  {
    id: 'international', name: 'International Students House', short: 'ISH', code: 'OU-21', category: 'hostel',
    cx: -250, cy: 660, w: 50, d: 32, rot: 0, floors: 3, height: 11, hero: null, entranceSide: 's', hub: 'intlFront',
    aliases: ['international', 'ish', 'foreign students', 'hostel'],
    hours: 'Open 24 × 7', access: 'South lobby',
    description: 'Residence and support office for international students and exchange scholars.',
    pois: [{ name: 'International Office', floor: 0, kind: 'office' }],
  },
  {
    id: 'guest', name: 'University Guest House', short: 'GST', code: 'OU-22', category: 'residential',
    cx: -700, cy: -70, w: 56, d: 34, rot: 0, floors: 3, height: 10, hero: null, entranceSide: 'e', hub: 'guestFront',
    aliases: ['guest house', 'visitors', 'stay', 'vip'],
    hours: '24 × 7 reception', access: 'East porch',
    description: 'Guest house for visiting faculty, examiners and delegates.',
    pois: [{ name: 'Reception', floor: 0, kind: 'office' }],
  },
  {
    id: 'faculty', name: 'Faculty Quarters', short: 'FQ', code: 'OU-23', category: 'residential',
    cx: -880, cy: 160, w: 72, d: 26, rot: 0, floors: 2, height: 8, hero: null, entranceSide: 'e', hub: 'facultyFront',
    aliases: ['faculty quarters', 'staff quarters', 'residence', 'faculty housing'],
    hours: 'Residents only', access: 'East lane',
    description: 'Faculty residential block set in the western grove.',
    pois: [{ name: 'Residents Association Room', floor: 0, kind: 'room' }],
  },
  {
    id: 'biotech', name: 'Institute of Biotechnology', short: 'IBT', code: 'OU-24', category: 'research',
    cx: 700, cy: 90, w: 56, d: 40, rot: -4, floors: 3, height: 12, hero: null, entranceSide: 'w', hub: 'biotechFront',
    aliases: ['biotech', 'biotechnology', 'ibt', 'genetics', 'research'],
    hours: '09:00 – 20:00', access: 'West entry',
    description: 'Biotechnology research institute with BSL-2 labs and the genomics suite.',
    pois: [
      { name: 'Genomics Suite', floor: 1, kind: 'lab' },
      { name: 'BSL-2 Lab', floor: 2, kind: 'lab' },
      { name: 'Seminar Room', floor: 0, kind: 'room' },
    ],
  },
  {
    id: 'botany', name: 'Botanical Garden Glasshouse', short: 'BOT', code: 'OU-25', category: 'research',
    cx: -360, cy: -720, w: 30, d: 22, rot: 0, floors: 1, height: 8, hero: null, entranceSide: 'n', hub: 'botGarden',
    aliases: ['botanical', 'glasshouse', 'garden', 'herbarium', 'conservatory'],
    hours: '07:00 – 18:00', access: 'North path',
    description: 'Glasshouse and herbarium at the heart of the OU botanical garden.',
    pois: [{ name: 'Herbarium', floor: 0, kind: 'facility' }, { name: 'Conservatory', floor: 0, kind: 'facility' }],
  },
  {
    id: 'gatehouse', name: 'Main Gate Security Post', short: 'MGS', code: 'OU-26', category: 'admin',
    cx: -140, cy: -830, w: 34, d: 22, rot: 0, floors: 1, height: 5, hero: null, entranceSide: 'n', hub: 'mainGate',
    aliases: ['security', 'main gate', 'gate', 'lost and found', 'visitor pass'],
    hours: '24 × 7', access: 'Gate plaza',
    description: 'Main gate security, visitor passes and campus lost-and-found.',
    pois: [{ name: 'Visitor Pass Desk', floor: 0, kind: 'office' }],
  },
];

const GATES = [
  { id: 'gate-main', node: 'mainGate', name: 'Main Gate', aliases: ['main gate', 'gate 1', 'entrance'] },
  { id: 'gate-east', node: 'eastGate', name: 'East Gate', aliases: ['east gate', 'gate 2', 'tarnaka'] },
  { id: 'gate-north', node: 'northGate', name: 'North Gate', aliases: ['north gate', 'gate 3'] },
  { id: 'gate-west', node: 'westGate', name: 'West Gate', aliases: ['west gate', 'gate 4', 'hostel gate'] },
  { id: 'gate-science', node: 'scienceGate', name: 'Science Gate', aliases: ['science gate', 'gate 5'] },
];

// ─────────────────────────────────────────────────────── geometry helpers ──
function rotate(x, y, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}

function rect(cx, cy, w, d, rot = 0) {
  const pts = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
  return pts.map(([x, y]) => {
    const [rx, ry] = rotate(x, y, rot);
    return [cx + rx, cy + ry];
  });
}

function ellipse(cx, cy, rx, ry, seg = 42) {
  const pts = [];
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

function ring(coords, close = true) {
  const out = coords.map(([x, y]) => toLngLat(x, y));
  out.push(out[0]);
  return out;
}

const polyFeature = (coords, props) => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'Polygon', coordinates: [ring(coords)] },
});

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

// ────────────────────────────────────────────────────────── buildings ──
const buildingFootprints = [];
const buildingFeatures = [];
const entranceNodes = [];

for (const b of BUILDINGS) {
  const poly = rect(b.cx, b.cy, b.w, b.d, b.rot);
  buildingFootprints.push({ id: b.id, poly });
  const side = b.entranceSide || 's';
  const local =
    side === 's' ? [0, -b.d / 2 - 9] :
    side === 'n' ? [0, b.d / 2 + 9] :
    side === 'e' ? [b.w / 2 + 9, 0] : [-b.w / 2 - 9, 0];
  const [ox, oy] = rotate(local[0], local[1], b.rot);
  const ex = b.cx + ox;
  const ey = b.cy + oy;
  const entranceId = `ent-${b.id}`;
  NODES[entranceId] = { x: ex, y: ey, label: `${b.short} entrance`, kind: 'entrance' };
  entranceNodes.push({ id: entranceId, buildingId: b.id, hub: b.hub, label: `${b.name} entrance`, x: ex, y: ey });

  const floors = b.floors;
  const footprintArea = Math.round(b.w * b.d);
  buildingFeatures.push({
    type: 'Feature',
    properties: {
      id: b.id,
      name: b.name,
      short: b.short,
      code: b.code,
      category: b.category,
      floors,
      height_m: b.height,
      base_m: elev(b.cx, b.cy),
      rot: b.rot,
      w_m: b.w,
      d_m: b.d,
      footprint_m2: footprintArea,
      hero: b.hero || '',
      hub: b.hub,
      entrance_node: entranceId,
      entrance_lng: toLngLat(ex, ey)[0],
      entrance_lat: toLngLat(ex, ey)[1],
      cx_lng: toLngLat(b.cx, b.cy)[0],
      cy_lat: toLngLat(b.cx, b.cy)[1],
      aliases: b.aliases.join('|'),
      hours: b.hours,
      access: b.access,
      description: b.description,
      pois: JSON.stringify(b.pois || []),
    },
    geometry: { type: 'Polygon', coordinates: [ring(poly)] },
  });
}

// ────────────────────────────────────────────────────────── edges ──
const EDGE_DEFS = [
  // ring promenade (campus loop road, shared surface)
  ['rrN', 'rrNE', 'road', 'asphalt', true, 0.55],
  ['rrNE', 'rrE', 'road', 'asphalt', true, 0.5],
  ['rrE', 'rrSE', 'road', 'asphalt', true, 0.5],
  ['rrSE', 'rrS', 'road', 'asphalt', true, 0.55],
  ['rrS', 'rrSW', 'road', 'asphalt', true, 0.5],
  ['rrSW', 'rrW', 'road', 'asphalt', true, 0.5],
  ['rrW', 'rrNW', 'road', 'asphalt', true, 0.5],
  ['rrNW', 'rrN', 'road', 'asphalt', true, 0.55],
  // quad paths
  ['rrS', 'fountain', 'promenade', 'paver', true, 0.35],
  ['fountain', 'artsN', 'promenade', 'paver', true, 0.3],
  ['rrN', 'artsN', 'promenade', 'paver', true, 0.3],
  ['rrNW', 'artsN', 'path', 'paver', true, 0.4],
  ['rrNE', 'masjidForecourt', 'path', 'paver', true, 0.4],
  ['rrS', 'libPlaza', 'path', 'paver', true, 0.45],
  ['rrSW', 'libPlaza', 'path', 'paver', true, 0.5],
  ['fountain', 'libPlaza', 'stairs', 'steps', true, 0.3],
  ['rrSE', 'canteenFront', 'path', 'paver', true, 0.35],
  ['rrSW', 'fountain', 'path', 'gravel', true, 0.55],
  ['rrNE', 'convocationFront', 'road', 'asphalt', true, 0.4],
  ['rrW', 'scienceFront', 'path', 'paver', true, 0.5],
  ['rrSE', 'adminFront', 'road', 'asphalt', true, 0.45],
  ['adminFront', 'lawFront', 'path', 'paver', true, 0.35],
  ['lawFront', 'rrSE', 'path', 'concrete', true, 0.4],
  ['rrSE', 'lawFront', 'path', 'concrete', true, 0.4],
  ['rrSW', 'commerceFront', 'road', 'asphalt', true, 0.5],
  ['libPlaza', 'examFront', 'path', 'concrete', true, 0.45],
  ['rrS', 'examFront', 'path', 'gravel', false, 0.6],
  ['examFront', 'adminFront', 'road', 'asphalt', true, 0.45],
  ['commerceFront', 'healthFront', 'path', 'concrete', false, 0.7],
  ['healthFront', 'botGarden', 'path', 'gravel', false, 0.8],
  ['examFront', 'gatePlaza', 'road', 'asphalt', true, 0.5],
  ['botGarden', 'gatePlaza', 'path', 'gravel', false, 0.65],
  ['gatePlaza', 'mainGate', 'road', 'asphalt', true, 0.5],
  // north / hostels
  ['rrN', 'northPlaza', 'road', 'asphalt', true, 0.4],
  ['northPlaza', 'northJunction', 'road', 'asphalt', true, 0.45],
  ['northJunction', 'northGate', 'road', 'asphalt', true, 0.55],
  ['northJunction', 'hostelJunction', 'road', 'asphalt', true, 0.55],
  ['northJunction', 'intlFront', 'path', 'paver', true, 0.4],
  ['hostelJunction', 'westGate', 'road', 'asphalt', true, 0.6],
  ['hostelJunction', 'nizamFront', 'road', 'asphalt', true, 0.4],
  ['hostelJunction', 'girlsFront', 'path', 'paver', true, 0.4],
  ['hostelJunction', 'pgFront', 'path', 'paver', false, 0.5],
  ['hostelJunction', 'facultyFront', 'road', 'asphalt', false, 0.6],
  ['pgFront', 'guestFront', 'road', 'asphalt', false, 0.7],
  ['guestFront', 'scienceFront', 'road', 'asphalt', true, 0.55],
  ['scienceFront', 'scienceGate', 'road', 'asphalt', true, 0.5],
  ['scienceGate', 'commerceFront', 'path', 'gravel', false, 0.85],
  // engineering / east
  ['rrE', 'ouceFront', 'path', 'paver', true, 0.4],
  ['ouceFront', 'biotechFront', 'road', 'asphalt', true, 0.4],
  ['biotechFront', 'eastGate', 'road', 'asphalt', true, 0.5],
  ['ouceFront', 'engineJunction', 'road', 'asphalt', true, 0.45],
  ['engineJunction', 'lakeEdge', 'path', 'gravel', false, 0.75],
  ['engineJunction', 'lawFront', 'road', 'asphalt', true, 0.5],
  // sports / north-east loop
  ['rrE', 'sportsJunction', 'road', 'asphalt', true, 0.4],
  ['sportsJunction', 'sportsFront', 'path', 'paver', true, 0.3],
  ['sportsFront', 'cricketJunction', 'path', 'gravel', true, 0.5],
  ['cricketJunction', 'nePlaza', 'road', 'asphalt', false, 0.6],
  ['nePlaza', 'eastGate', 'road', 'asphalt', false, 0.6],
  ['nePlaza', 'northGate', 'road', 'asphalt', false, 0.6],
];

// building entrance connectors
for (const e of entranceNodes) {
  EDGE_DEFS.push([e.hub, e.id, e.buildingId === 'library' ? 'path' : 'path', 'paver', true, 0.35]);
}

function curvedLine(a, b, bend) {
  const [ax, ay] = [a.x, a.y];
  const [bx, by] = [b.x, b.y];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (ax + bx) / 2 + nx * bend;
  const my = (ay + by) / 2 + ny * bend;
  return [
    [ax, ay],
    [mx, my],
    [bx, by],
  ];
}

function lineLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) total += dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  return total;
}

const walkwayFeatures = [];
const usedPairs = new Set();

EDGE_DEFS.forEach(([from, to, kind, surface, lit, crowd], index) => {
  const a = NODE(from);
  const b = NODE(to);
  const len = dist(a.x, a.y, b.x, b.y);
  const key = [from, to].sort().join('::');
  if (usedPairs.has(key)) return; // no duplicate parallel edges (except intentional ones)
  usedPairs.add(key);

  const bendMag = kind === 'stairs' ? 0 : Math.min(18, len * 0.09) * (rand() > 0.5 ? 1 : -1);
  const pts = kind === 'stairs' ? [[a.x, a.y], [b.x, b.y]] : curvedLine(a, b, rand() > 0.45 ? bendMag : 0);
  const geometry = pts.map(([x, y]) => toLngLat(x, y));
  const elevFrom = elev(a.x, a.y);
  const elevTo = elev(b.x, b.y);
  const lengthM = R1(lineLength(pts));
  const grade = lengthM > 0 ? (elevTo - elevFrom) / lengthM : 0;

  walkwayFeatures.push({
    type: 'Feature',
    properties: {
      id: `e-${String(index + 1).padStart(3, '0')}`,
      from,
      to,
      from_label: a.label,
      to_label: b.label,
      kind,
      surface,
      width_m: kind === 'road' ? 7.5 : kind === 'promenade' ? 5.5 : kind === 'stairs' ? 3.2 : 3.6,
      lit: lit ? 1 : 0,
      crowd,
      accessible: kind !== 'stairs' ? 1 : 0,
      steps: kind === 'stairs' ? 14 : 0,
      length_m: lengthM,
      elev_from: elevFrom,
      elev_to: elevTo,
      grade: Math.round(grade * 1000) / 1000,
      shade: surface === 'gravel' ? 0.35 : 0.2,
      name: `${a.label} → ${b.label}`,
    },
    geometry: { type: 'LineString', coordinates: geometry },
  });
});

// ─────────────────────────────────────────────────────────── foliage ──
const ZONES = [
  { cls: 'lawn', name: 'Arts North Lawn', pts: [[-100, 40], [100, 40], [100, 185], [-100, 185]] },
  { cls: 'lawn', name: 'Arts South Lawn', pts: [[-110, -40], [110, -40], [110, -96], [-110, -96]] },
  { cls: 'lawn', name: 'Science Forecourt Lawn', pts: [[-465, -8], [-330, -8], [-330, -66], [-465, -66]] },
  { cls: 'lawn', name: 'Library Lawn', pts: [[-186, -206], [-54, -206], [-54, -302], [-186, -302]] },
  { cls: 'lawn', name: 'Convocation Green', pts: [[230, 40], [360, 40], [360, 120], [230, 120]] },
  { cls: 'lawn', name: 'Hostel Green', pts: [[-620, 430], [-280, 430], [-280, 600], [-620, 600]] },
  { cls: 'garden', name: 'OU Botanical Garden', pts: [[-500, -820], [-200, -820], [-200, -600], [-500, -600]] },
  { cls: 'grove', name: 'Western Grove', pts: [[-1030, 480], [-690, 480], [-690, 760], [-1030, 760]] },
  { cls: 'grove', name: 'Engineering Grove', pts: [[280, 300], [470, 300], [470, 470], [280, 470]] },
  { cls: 'grove', name: 'South-West Grove', pts: [[-960, -560], [-700, -560], [-700, -260], [-960, -260]] },
  { cls: 'grove', name: 'North Belt', pts: [[120, 600], [420, 600], [420, 760], [120, 760]] },
  { cls: 'turf', name: 'Cricket Ground', ellipse: [600, 440, 132, 92] },
  { cls: 'turf', name: 'North Athletics Field', ellipse: [250, 720, 120, 66] },
  { cls: 'water', name: 'Campus Lake', ellipse: [880, -520, 150, 100] },
];

const foliageFeatures = ZONES.map((z) => {
  const pts = z.pts || ellipse(z.ellipse[0], z.ellipse[1], z.ellipse[2], z.ellipse[3]);
  return polyFeature(pts, { class: z.cls, name: z.name, soft: z.cls === 'lawn' ? 1 : 0 });
});

// trees: promenade allées + groves + garden
const trees = [];
const treeBlockers = [...buildingFootprints.map((b) => b.poly)];
const water = ZONES.find((z) => z.cls === 'water');
const waterPoly = ellipse(water.ellipse[0], water.ellipse[1], water.ellipse[2] * 1.05, water.ellipse[3] * 1.05);

function tryTree(x, y, scale = 1) {
  if (trees.length > 1250) return;
  if (treeBlockers.some((poly) => pointInPoly(x, y, poly))) return;
  if (pointInPoly(x, y, waterPoly)) return;
  for (const t of trees) {
    if (dist(t.x, t.y, x, y) < 7.5) return;
  }
  const h = R1((6.5 + rand() * 7.5) * scale);
  trees.push({
    x,
    y,
    h,
    r: R1((2.4 + rand() * 2.9) * scale),
    species: Math.floor(rand() * 5),
    phase: R1(rand() * Math.PI * 2),
    tone: R1(rand()),
  });
}

// allée planting along walkways
for (const f of walkwayFeatures) {
  if (f.properties.kind === 'stairs') continue;
  const coords = f.geometry.coordinates;
  for (let i = 1; i < coords.length; i += 1) {
    const [x1, y1] = [ (coords[i - 1][0] - DATUM.lng) * M_PER_DEG_LNG, (coords[i - 1][1] - DATUM.lat) * M_PER_DEG_LAT ];
    const [x2, y2] = [ (coords[i][0] - DATUM.lng) * M_PER_DEG_LNG, (coords[i][1] - DATUM.lat) * M_PER_DEG_LAT ];
    const segLen = dist(x1, y1, x2, y2);
    const spacing = 26;
    const n = Math.floor(segLen / spacing);
    for (let s = 0; s < n; s += 1) {
      const t = (s + 0.5) / Math.max(1, n);
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      const nx = -(y2 - y1) / (segLen || 1);
      const ny = (x2 - x1) / (segLen || 1);
      for (const sideSign of [-1, 1]) {
        if (rand() > 0.72) continue;
        const off = (f.properties.kind === 'road' ? 8.5 : 5.5) + rand() * 2.2;
        tryTree(px + nx * off * sideSign, py + ny * off * sideSign, 0.92 + rand() * 0.2);
      }
    }
  }
}

// groves and gardens
for (const z of ZONES) {
  if (!['grove', 'garden', 'lawn'].includes(z.cls)) continue;
  const pts = z.pts || ellipse(z.ellipse[0], z.ellipse[1], z.ellipse[2], z.ellipse[3]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const density = z.cls === 'grove' ? 0.32 : z.cls === 'garden' ? 0.22 : 0.05;
  const count = Math.round((maxX - minX) * (maxY - minY) * density / 320);
  for (let i = 0; i < count; i += 1) {
    const x = minX + rand() * (maxX - minX);
    const y = minY + rand() * (maxY - minY);
    if (pointInPoly(x, y, pts)) tryTree(x, y, 0.9 + rand() * 0.35);
  }
}

for (const t of trees) {
  foliageFeatures.push({
    type: 'Feature',
    properties: {
      class: 'tree',
      species: t.species,
      h: t.h,
      r: t.r,
      phase: t.phase,
      tone: t.tone,
      elev: elev(t.x, t.y),
    },
    geometry: { type: 'Point', coordinates: toLngLat(t.x, t.y) },
  });
}

// ─────────────────────────────────────────────────────── terrain/contours ──
const BOUNDARY = [
  [-1180, -760], [-1040, -960], [-520, -1000], [-170, -930], [250, -980], [700, -900],
  [1000, -640], [1110, -250], [1070, 210], [960, 600], [620, 890], [210, 960],
  [-220, 940], [-610, 880], [-960, 690], [-1140, 350], [-1190, -110], [-1170, -460],
];

const terrainFeatures = [
  polyFeature(BOUNDARY, { class: 'boundary', name: 'Osmania University — Main Campus' }),
];

const waterZone = ZONES.find((z) => z.cls === 'water');
terrainFeatures.push(
  polyFeature(ellipse(waterZone.ellipse[0], waterZone.ellipse[1], waterZone.ellipse[2], waterZone.ellipse[3], 64), {
    class: 'water',
    name: waterZone.name,
  })
);

// Marching-squares contours from the synthetic terrain field
const contourLevels = [];
for (let lv = 2; lv <= 14; lv += 2) contourLevels.push(lv);
for (const level of contourLevels) {
  const step = 34;
  const segments = [];
  for (let x = -1200; x < 1200; x += step) {
    for (let y = -1000; y < 1000; y += step) {
      const corners = [
        [x, y],
        [x + step, y],
        [x + step, y + step],
        [x, y + step],
      ];
      const vals = corners.map(([cx, cy]) => elev(cx, cy) - level);
      const pts = [];
      for (let i = 0; i < 4; i += 1) {
        const v1 = vals[i];
        const v2 = vals[(i + 1) % 4];
        if ((v1 <= 0 && v2 > 0) || (v1 > 0 && v2 <= 0)) {
          const t = v1 / (v1 - v2);
          const [ax, ay] = corners[i];
          const [bx, by] = corners[(i + 1) % 4];
          pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
        }
      }
      if (pts.length >= 2) {
        if (!pointInPoly((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, BOUNDARY)) continue;
        segments.push([toLngLat(pts[0][0], pts[0][1]), toLngLat(pts[1][0], pts[1][1])]);
      }
    }
  }
  if (segments.length) {
    terrainFeatures.push({
      type: 'Feature',
      properties: { class: 'contour', elev: level, major: level % 6 === 0 ? 1 : 0 },
      geometry: { type: 'MultiLineString', coordinates: segments },
    });
  }
}

// ───────────────────────────────────────────────────────────── output ──
const write = (name, features) => {
  const fc = {
    type: 'FeatureCollection',
    name: `ou-${name}`,
    metadata: { datum: DATUM, units: 'metres (local tangent plane)', generated: new Date().toISOString() },
    features,
  };
  fs.writeFileSync(path.join(OUT, `ou-${name}.geojson`), JSON.stringify(fc, null, 1));
  return features.length;
};

fs.mkdirSync(OUT, { recursive: true });
const nB = write('buildings', buildingFeatures);
const nW = write('walkways', walkwayFeatures);
const nF = write('foliage', foliageFeatures);
const nT = write('terrain', terrainFeatures);

// graph connectivity audit (BFS over entrance connectors + network)
const adj = new Map();
for (const f of walkwayFeatures) {
  const { from, to } = f.properties;
  if (!adj.has(from)) adj.set(from, []);
  if (!adj.has(to)) adj.set(to, []);
  adj.get(from).push(to);
  adj.get(to).push(from);
}
const seen = new Set(['rrS']);
const queue = ['rrS'];
while (queue.length) {
  const cur = queue.shift();
  for (const nxt of adj.get(cur) || []) {
    if (!seen.has(nxt)) {
      seen.add(nxt);
      queue.push(nxt);
    }
  }
}
const unreachable = Object.keys(NODES).filter((n) => !seen.has(n));
if (unreachable.length) {
  console.error('✗ unreachable nodes:', unreachable.join(', '));
  process.exitCode = 1;
}

fs.writeFileSync(
  path.join(OUT, 'campus-meta.json'),
  JSON.stringify(
    {
      name: 'Osmania University — Main Campus',
      shortName: 'OU',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      datum: DATUM,
      centroid: [DATUM.lng, DATUM.lat],
      elevationMean: 530,
      areaKm2: 4.6,
      gates: GATES,
      counts: { buildings: nB, walkwayEdges: nW, trees: trees.length, terrainFeatures: nT },
      survey: 'Self-authored vector survey · no third-party tile or map API dependencies',
      revision: '2026.11',
    },
    null,
    2
  )
);

console.log(`✓ buildings: ${nB}`);
console.log(`✓ walkway edges: ${nW}  (nodes: ${Object.keys(NODES).length})`);
console.log(`✓ foliage features: ${nF}  (trees: ${trees.length})`);
console.log(`✓ terrain features: ${nT}`);
console.log(`✓ graph reachability: ${seen.size}/${Object.keys(NODES).length} nodes`);
