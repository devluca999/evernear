// Simulated cast. Astro Robotics, its products, BOM and suppliers are fictional.
// Numbers follow docs/BUILD.md section 2 and the deal Luca set on Nov 6: 500 robots ordered, parts
// for 450, 50 AM-17 motors short at $1,200, an urgent ceiling of 5%. Rules: policy/astro.json.
import type { BomLine, Offer, Policy, Supplier } from "../engine/types";
import { cents } from "../engine/money";
import rules from "../policy/astro.json";

export const astro = {
  id: "astro",
  name: "Astro Robotics Inc.",
  city: "Chicago",
  country: "USA",
  buyer: "Luca",
  secondApprover: "Jordy",
};

export const products = [
  { id: "10ma", name: "10MA", kind: "Helper robot", playable: true, priceCents: 950_000 },
  { id: "kip", name: "Kip", kind: "Floor cleaning robot", playable: false },
  { id: "porter", name: "Porter", kind: "Factory delivery cart", playable: false },
] as const;

const line = (n: number, part: string, qty: number, specs: Record<string, string>): BomLine => ({
  id: `10ma-${String(n).padStart(2, "0")}`, product: "10ma", part, qty, specs,
});

export const MOTOR_PART = "Actuator motor";

export const bom10MA: BomLine[] = [
  line(1, MOTOR_PART, 1, { shaftDiameter: "6 mm", mountingFlange: "NEMA 17", voltage: "48 V", encoderConnector: "Molex" }),
  line(2, "Chassis frame", 1, { material: "6061 aluminium", height: "1,180 mm" }),
  line(3, "Arm servo", 2, { torque: "25 kg cm", voltage: "12 V" }),
  line(4, "Battery pack", 1, { voltage: "48 V", capacity: "20 Ah" }),
  line(5, "Controller board", 1, { mcu: "ARM Cortex-M7", bus: "CAN FD" }),
  line(6, "Camera module", 2, { resolution: "1080p", interface: "MIPI CSI-2" }),
  line(7, "Encoder harness", 4, { connector: "Molex", length: "300 mm" }),
  line(8, "Drive wheel", 2, { diameter: "150 mm", tread: "polyurethane" }),
  line(9, "Lidar sensor", 1, { range: "12 m", interface: "UART" }),
  line(10, "Head shell", 1, { material: "ABS", finish: "matte" }),
  line(11, "Speaker", 1, { power: "5 W", impedance: "4 ohm" }),
  line(12, "Microphone array", 1, { channels: "4", interface: "I2S" }),
  line(13, "Wiring loom", 1, { gauge: "18 AWG", length: "2 m" }),
  line(14, "Fastener kit", 1, { standard: "ISO metric", grade: "A2 stainless" }),
];

/** Sample BOMs for the products the story does not play, so the Products view can be browsed. */
const sampleLine = (product: string, n: number, part: string, qty: number, specs: Record<string, string>): BomLine => ({
  id: `${product}-${String(n).padStart(2, "0")}`, product, part, qty, specs,
});
export const bomKip: BomLine[] = [
  sampleLine("kip", 1, "Brush motor", 2, { voltage: "24 V", speed: "1,200 rpm" }),
  sampleLine("kip", 2, "Suction fan", 1, { airflow: "18 l/s", voltage: "24 V" }),
  sampleLine("kip", 3, "Battery pack", 1, { voltage: "24 V", capacity: "10 Ah" }),
  sampleLine("kip", 4, "Bumper sensor", 4, { type: "microswitch", travel: "3 mm" }),
  sampleLine("kip", 5, "Controller board", 1, { mcu: "ARM Cortex-M4", bus: "CAN" }),
  sampleLine("kip", 6, "Drive wheel", 2, { diameter: "90 mm", tread: "rubber" }),
  sampleLine("kip", 7, "Water tank", 1, { volume: "2 l", material: "PP" }),
  sampleLine("kip", 8, "Housing", 1, { material: "ABS", finish: "matte" }),
];
export const bomPorter: BomLine[] = [
  sampleLine("porter", 1, "Hub motor", 4, { power: "250 W", voltage: "48 V" }),
  sampleLine("porter", 2, "Battery pack", 2, { voltage: "48 V", capacity: "30 Ah" }),
  sampleLine("porter", 3, "Lidar sensor", 2, { range: "25 m", interface: "Ethernet" }),
  sampleLine("porter", 4, "Controller board", 1, { mcu: "ARM Cortex-A53", bus: "CAN FD" }),
  sampleLine("porter", 5, "Cargo deck", 1, { load: "150 kg", material: "steel" }),
  sampleLine("porter", 6, "Safety light", 2, { colour: "amber", rating: "IP65" }),
  sampleLine("porter", 7, "Caster wheel", 2, { diameter: "100 mm", tread: "polyurethane" }),
];
export const bomFor: Record<string, BomLine[]> = { "10ma": bom10MA, kip: bomKip, porter: bomPorter };

/** Sample stock on hand per part (units). The actuator motor count comes from the scenario. */
export const partStock: Record<string, number> = {
  "Chassis frame": 520, "Arm servo": 1_040, "Battery pack": 510, "Controller board": 505, "Camera module": 1_030, "Encoder harness": 2_070,
  "Drive wheel": 1_020, "Lidar sensor": 515, "Head shell": 540, "Speaker": 525, "Microphone array": 512, "Wiring loom": 530, "Fastener kit": 600,
  "Brush motor": 34, "Suction fan": 12, "Bumper sensor": 80, "Water tank": 17, "Housing": 15, "Hub motor": 20, "Cargo deck": 6,
  "Safety light": 24, "Caster wheel": 18,
};

export const suppliers: Supplier[] = [
  { id: "ultra", name: "Ultra Motion", city: "Illinois", country: "USA", approved: true, isNew: false, receiveChain: "near", receiveAddress: "ultra-motion.testnet" },
  { id: "haoyun", name: "Haoyun Precision", city: "Shenzhen", country: "China", approved: true, isNew: true, receiveChain: "base", receiveAddress: "0x2003975a521c6fa45238dbc402c9e4adcb8863e0" },
  { id: "quickship", name: "QuickShip Motion", city: "Busan", country: "South Korea", approved: true, isNew: true, receiveChain: "near", receiveAddress: "quickship-motion.testnet" },
  { id: "kansai", name: "Kansai Servo Works", city: "Osaka", country: "Japan", approved: true, isNew: true, receiveChain: "near", receiveAddress: "kansai-servo.testnet" },
  { id: "rheinwerk", name: "Rheinwerk Antriebstechnik", city: "Stuttgart", country: "Germany", approved: false, isNew: true, receiveChain: "near", receiveAddress: "rheinwerk.testnet" },
  { id: "huaxin", name: "Huaxin Robotics Components", city: "Dongguan", country: "China", approved: true, isNew: true, receiveChain: "near", receiveAddress: "huaxin-robotics.testnet" },
];

/** The AM-17's base price before the shortage. */
export const MOTOR_BASE_CENTS = 120_000;

export const policy: Policy = {
  autoApproveUnderCents: cents(rules.auto_approve_under_usd),
  approversRequired: rules.approvers_required,
  priceChangeLimitBps: rules.price_change_limit_percent * 100,
  // The urgent ceiling: base plus the price change limit.
  priceCaps: { [MOTOR_PART]: MOTOR_BASE_CENTS + (MOTOR_BASE_CENTS * rules.price_change_limit_percent) / 100 },
};

/** Every 10MA order must ship by this day; a supplier that cannot deliver before it is too late. */
export const NEED_BY = rules.need_by;

const motor = MOTOR_PART;
const fits = bom10MA[0].specs;
const specsOf = (part: string) => bom10MA.find((l) => l.part === part)!.specs;

// Huaxin quotes 11 of the 14 lines and fails 3: motor flange, encoder harness connector, battery voltage.
const huaxinParts = [
  "Actuator motor", "Chassis frame", "Arm servo", "Battery pack", "Controller board", "Camera module",
  "Encoder harness", "Drive wheel", "Head shell", "Wiring loom", "Fastener kit",
];
const huaxinOverrides: Record<string, Record<string, string>> = {
  "Actuator motor": { mountingFlange: "NEMA 23" },
  "Encoder harness": { connector: "JST-GH" },
  "Battery pack": { voltage: "36 V" },
};
const huaxinPrice: Record<string, number> = { "Actuator motor": 110_000 };

export const offers: Offer[] = [
  { supplierId: "ultra", part: motor, unitCents: MOTOR_BASE_CENTS, specs: { ...fits }, arrives: "2026-12-15" },
  { supplierId: "haoyun", part: motor, unitCents: MOTOR_BASE_CENTS, specs: { ...fits }, arrives: "2026-11-11" },
  { supplierId: "quickship", part: motor, unitCents: MOTOR_BASE_CENTS, specs: { ...fits }, arrives: "2026-11-08" },
  // Fits every spec, but cannot deliver before Dec 14.
  { supplierId: "kansai", part: motor, unitCents: 118_000, specs: { ...fits }, arrives: "2026-12-22" },
  // 2.4x the urgent ceiling: 126,000 x 2.4 = 302,400
  { supplierId: "rheinwerk", part: motor, unitCents: 302_400, specs: { ...fits }, arrives: "2026-11-20" },
  ...huaxinParts.map((part) => ({
    supplierId: "huaxin",
    part,
    unitCents: huaxinPrice[part] ?? 1000,
    arrives: "2026-11-18",
    specs: { ...specsOf(part), ...(huaxinOverrides[part] ?? {}) },
  })),
];

export const PO = {
  number: "1042",
  quantity: 50,
  originalUnitCents: MOTOR_BASE_CENTS,
  /** Both contenders open with a +10% urgent fee. */
  confirmedUnitCents: 132_000,
  /** Haoyun's final offer: all 50 by Dec 14 at +5%. */
  revisedUnitCents: 126_000,
  revisedTotalCents: 50 * 126_000,
  receivedQty: 44,
};

/** A routine reorder under the cap that pays itself: encoder harnesses from an established supplier. */
export const routineReorder = { supplier: "Pacific Harness Co.", po: "1039", part: "Encoder harness", quantity: 220, unitCents: 1900 };

export const demand = {
  robotsOrdered: 500,
  motorsPerRobot: 1,
  motorsOnHand: 450,
  customers: [
    { name: "Harbor and Vine Restaurant Group", so: "3326", robots: 200, due: "30 Nov" },
    { name: "St. Brennan Hospital", so: "3329", robots: 180, due: "7 Dec" },
    { name: "Northgate Fulfillment warehouse", so: "3331", robots: 120, due: "14 Dec" },
  ],
};

/** QuickShip's final offer: about three quarters now at +10%, the rest after Dec 14, and 5% off the next order. */
export const quickshipOffer = { nowQty: 38, laterQty: 12, unitCents: 132_000, nextOrderDiscountPercent: 5 };

/** The parts the 10MA build plan watches, with their stock codes and how many each robot takes. */
export const buildPlan = [
  { part: MOTOR_PART, code: "AM17", perRobot: 1 },
  { part: "Arm servo", code: "AS25", perRobot: 2 },
  { part: "Encoder harness", code: "EH30", perRobot: 4 },
  { part: "Battery pack", code: "BP48", perRobot: 1 },
];

/** Actuator motors on hand, 14 Sep to 2 Nov: the slide that set off the story. */
export const motorHistory = { from: "14 Sep", to: "2 Nov", reorderPoint: 480, units: [1180, 1110, 1030, 940, 860, 780, 690, 600, 520, 450] };

/** Astro's wallet and spend, simulated. */
export const wallet = {
  balanceCents: 41_260_000,
  keys: [
    { name: "Luca's laptop", role: "Owner key" },
    { name: "Jordy's phone", role: "Owner key" },
    { name: "Hardware key, finance safe", role: "Recovery" },
  ],
  /** Spend per month before November, in cents. November adds this story's payments. */
  spend: [["Jun", 2_140_000], ["Jul", 2_920_000], ["Aug", 1_730_000], ["Sep", 2_510_000], ["Oct", 2_300_000]] as [string, number][],
};

/** Story dates and places shown on screen. */
export const story = {
  committedAt: "3 Nov 15:04",
  departedAt: "5 Nov 22:10",
  dockAt: "Wed 11 Nov 08:40 · Dock 3",
  paidAt: "11 Nov 08:42",
  deadline: "11 Dec",
  remainderShips: "18 Nov",
  closedInDays: 9,
};

/** Astro's other purchase orders and quotes, for the Purchase tab. */
export const purchaseOrders = [
  { ref: "PO 1037", supplier: "Ultra Motion", location: "Cutchogue, NY", approved: true, fitment: true },
  { ref: "PO 1039", supplier: "Pacific Harness Co.", location: "Fresno, CA", approved: true, fitment: true },
];

/** Shipments out to Astro's customers. */
export const shipmentsOut = [
  { ref: "SH 8812", what: "2 Kip to Lakeview Schools", date: "30 Oct", done: true },
  { ref: "SH 8815", what: "4 Porter to Northgate", date: "2 Nov", done: true },
  { ref: "SH 8819", what: "6 10MA to Harbor and Vine", date: "18 Nov", done: false },
];
