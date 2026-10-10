// Curated APP-6D / MIL-STD-2525D picks. Anything not listed can be entered as a raw 20-digit SIDC
// (e.g. copied from the Spatial Illusions Unit Generator).

export interface SymbolSet {
  code: string;
  label: string;
  entities: [code: string, label: string][];
}

export const SYMBOL_SETS: SymbolSet[] = [
  {
    code: "10",
    label: "Land unit",
    entities: [
      ["121100", "Infantry"],
      ["121102", "Mechanized infantry"],
      ["121104", "Motorized infantry"],
      ["121101", "Amphibious infantry"],
      ["120500", "Armor"],
      ["120501", "Armored reconnaissance"],
      ["120400", "Anti-armor"],
      ["120100", "Air assault"],
      ["120300", "Amphibious"],
      ["121000", "Combined arms"],
      ["121300", "Reconnaissance"],
      ["121303", "Motorized reconnaissance"],
      ["121500", "Sniper"],
      ["121200", "Observer"],
      ["121600", "Surveillance"],
      ["121700", "Special forces"],
      ["121800", "Special operations forces"],
      ["122000", "Ranger"],
      ["121900", "Unmanned systems"],
      ["120600", "Aviation, rotary wing"],
      ["120800", "Aviation, fixed wing"],
      ["130100", "Air defense"],
      ["130300", "Field artillery"],
      ["130800", "Mortar"],
      ["130700", "Missile"],
      ["140700", "Engineer"],
      ["140800", "Explosive ordnance disposal"],
      ["140100", "CBRN"],
      ["141200", "Military police"],
      ["141700", "Security"],
      ["150500", "Electronic warfare"],
      ["151000", "Military intelligence"],
      ["110000", "Command and control"],
      ["110500", "Liaison"],
      ["111000", "Signal"],
      ["160000", "Sustainment"],
      ["160100", "Administrative"],
      ["160400", "Ammunition"],
      ["161100", "Maintenance"],
      ["161300", "Medical"],
      ["163400", "Supply"],
      ["163600", "Transportation"],
    ],
  },
  {
    code: "27",
    label: "Dismounted individual",
    entities: [
      ["110101", "Infantry"],
      ["110102", "Medical"],
      ["110103", "Reconnaissance"],
      ["110209", "Sniper"],
      ["110211", "Designated marksman"],
      ["110212", "Medic"],
      ["110207", "Observer"],
      ["110219", "Demolition"],
      ["110220", "Commander"],
      ["110301", "Rifle"],
      ["110305", "Machine gun"],
      ["110316", "Anti-tank rocket launcher"],
    ],
  },
  {
    code: "15",
    label: "Land equipment",
    entities: [
      ["120100", "Armored vehicle"],
      ["120200", "Tank"],
      ["140100", "Utility vehicle"],
      ["140600", "Semi-trailer truck"],
      ["110900", "Howitzer"],
      ["111400", "Mortar"],
      ["111600", "Multiple rocket launcher"],
      ["111200", "Anti-tank missile launcher"],
      ["111100", "Air defense missile launcher"],
      ["110200", "Machine gun"],
      ["130800", "Earthmover"],
      ["131100", "Dozer"],
    ],
  },
  {
    code: "01",
    label: "Air",
    entities: [
      ["110100", "Fixed-wing"],
      ["110102", "Attack / strike"],
      ["110104", "Fighter"],
      ["110107", "Cargo"],
      ["110111", "Reconnaissance"],
      ["110200", "Rotary wing"],
      ["110300", "UAV"],
    ],
  },
  {
    code: "30",
    label: "Sea surface",
    entities: [
      ["120500", "Patrol"],
      ["120501", "Patrol craft"],
      ["120308", "Landing craft"],
      ["120800", "Military speedboat"],
      ["120200", "Surface combatant"],
      ["130108", "Cargo ship"],
    ],
  },
  {
    code: "20",
    label: "Installation",
    entities: [
      ["110000", "Military installation"],
      ["110200", "Ammunition cache"],
      ["111900", "Tent / camp"],
      ["110701", "Bridge"],
      ["111300", "Mine"],
      ["110900", "Government"],
    ],
  },
];

export const ECHELONS: [code: string, label: string][] = [
  ["00", "Unspecified"],
  ["11", "Team / crew"],
  ["12", "Squad"],
  ["13", "Section"],
  ["14", "Platoon / detachment"],
  ["15", "Company / battery / troop"],
  ["16", "Battalion / squadron"],
  ["17", "Regiment / group"],
  ["18", "Brigade"],
  ["21", "Division"],
  ["22", "Corps"],
  ["23", "Army"],
];

// 8th char of the SIDC: headquarters / task force / feint-dummy.
export const HQTFD: [code: string, label: string][] = [
  ["0", "None"],
  ["2", "Headquarters"],
  ["4", "Task force"],
  ["6", "Task force HQ"],
  ["1", "Feint / dummy"],
];

export const STATUS: [code: string, label: string][] = [
  ["0", "Present"],
  ["1", "Planned / anticipated"],
];
