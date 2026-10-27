import type { Address, Buyer } from "@/lib/domain";
import type { Rng } from "./rng";

/**
 * Made-up buyers and addresses for the demo shop. The cities, ZIP codes and USPS plants are real
 * places, so tracking reads true; the people, house numbers and emails are invented, and every
 * email uses a reserved example domain.
 */

export interface City {
  city: string;
  state: string;
  zip: string;
  /** Hours from UTC in late October, for local delivery times. */
  utcOffset: number;
  /** The USPS plant that sorts for this ZIP. */
  plant: string;
  /** Network plants a parcel from Portland passes on the way. */
  via: string[];
  /** Ground Advantage days from Portland, fastest and slowest. */
  days: [number, number];
}

const DENVER_NDC = "DENVER CO NETWORK DISTRIBUTION CENTER";
const CHICAGO_NDC = "CHICAGO IL NETWORK DISTRIBUTION CENTER";
const ATLANTA_NDC = "ATLANTA GA NETWORK DISTRIBUTION CENTER";
const DALLAS_NDC = "DALLAS TX NETWORK DISTRIBUTION CENTER";
const PHILADELPHIA_NDC = "PHILADELPHIA PA NETWORK DISTRIBUTION CENTER";
const SPRINGFIELD_NDC = "SPRINGFIELD MA NETWORK DISTRIBUTION CENTER";
const SALT_LAKE = "SALT LAKE CITY UT DISTRIBUTION CENTER";
const KANSAS_CITY_NDC = "KANSAS CITY KS NETWORK DISTRIBUTION CENTER";

export const CITIES: Record<string, City> = {
  portland: {
    city: "Portland",
    state: "OR",
    zip: "97214",
    utcOffset: -7,
    plant: "PORTLAND OR DISTRIBUTION CENTER",
    via: [],
    days: [1, 2],
  },
  eugene: {
    city: "Eugene",
    state: "OR",
    zip: "97405",
    utcOffset: -7,
    plant: "EUGENE OR DISTRIBUTION CENTER",
    via: [],
    days: [2, 2],
  },
  seattle: {
    city: "Seattle",
    state: "WA",
    zip: "98103",
    utcOffset: -7,
    plant: "SEATTLE WA DISTRIBUTION CENTER",
    via: [],
    days: [2, 3],
  },
  spokane: {
    city: "Spokane",
    state: "WA",
    zip: "99203",
    utcOffset: -7,
    plant: "SPOKANE WA DISTRIBUTION CENTER",
    via: [],
    days: [2, 3],
  },
  sacramento: {
    city: "Sacramento",
    state: "CA",
    zip: "95814",
    utcOffset: -7,
    plant: "SACRAMENTO CA DISTRIBUTION CENTER",
    via: [],
    days: [3, 4],
  },
  oakland: {
    city: "Oakland",
    state: "CA",
    zip: "94610",
    utcOffset: -7,
    plant: "OAKLAND CA DISTRIBUTION CENTER",
    via: [],
    days: [3, 4],
  },
  losAngeles: {
    city: "Los Angeles",
    state: "CA",
    zip: "90026",
    utcOffset: -7,
    plant: "LOS ANGELES CA DISTRIBUTION CENTER",
    via: [],
    days: [3, 4],
  },
  sanDiego: {
    city: "San Diego",
    state: "CA",
    zip: "92104",
    utcOffset: -7,
    plant: "SAN DIEGO CA DISTRIBUTION CENTER",
    via: [],
    days: [3, 5],
  },
  boise: {
    city: "Boise",
    state: "ID",
    zip: "83702",
    utcOffset: -6,
    plant: "BOISE ID DISTRIBUTION CENTER",
    via: [],
    days: [2, 3],
  },
  saltLake: {
    city: "Salt Lake City",
    state: "UT",
    zip: "84105",
    utcOffset: -6,
    plant: SALT_LAKE,
    via: [],
    days: [3, 4],
  },
  denver: {
    city: "Denver",
    state: "CO",
    zip: "80206",
    utcOffset: -6,
    plant: "DENVER CO DISTRIBUTION CENTER",
    via: [SALT_LAKE],
    days: [3, 5],
  },
  phoenix: {
    city: "Phoenix",
    state: "AZ",
    zip: "85004",
    utcOffset: -7,
    plant: "PHOENIX AZ DISTRIBUTION CENTER",
    via: [],
    days: [3, 5],
  },
  santaFe: {
    city: "Santa Fe",
    state: "NM",
    zip: "87501",
    utcOffset: -6,
    plant: "ALBUQUERQUE NM DISTRIBUTION CENTER",
    via: [DENVER_NDC],
    days: [4, 5],
  },
  austin: {
    city: "Austin",
    state: "TX",
    zip: "78704",
    utcOffset: -5,
    plant: "AUSTIN TX DISTRIBUTION CENTER",
    via: [DENVER_NDC, DALLAS_NDC],
    days: [4, 5],
  },
  dallas: {
    city: "Dallas",
    state: "TX",
    zip: "75206",
    utcOffset: -5,
    plant: "DALLAS TX DISTRIBUTION CENTER",
    via: [DENVER_NDC, DALLAS_NDC],
    days: [4, 5],
  },
  kansasCity: {
    city: "Kansas City",
    state: "MO",
    zip: "64111",
    utcOffset: -5,
    plant: "KANSAS CITY MO DISTRIBUTION CENTER",
    via: [DENVER_NDC, KANSAS_CITY_NDC],
    days: [4, 5],
  },
  minneapolis: {
    city: "Minneapolis",
    state: "MN",
    zip: "55406",
    utcOffset: -5,
    plant: "MINNEAPOLIS MN DISTRIBUTION CENTER",
    via: [DENVER_NDC],
    days: [4, 5],
  },
  madison: {
    city: "Madison",
    state: "WI",
    zip: "53703",
    utcOffset: -5,
    plant: "MADISON WI DISTRIBUTION CENTER",
    via: [DENVER_NDC, CHICAGO_NDC],
    days: [4, 6],
  },
  chicago: {
    city: "Chicago",
    state: "IL",
    zip: "60614",
    utcOffset: -5,
    plant: "CHICAGO IL DISTRIBUTION CENTER",
    via: [DENVER_NDC, CHICAGO_NDC],
    days: [4, 5],
  },
  annArbor: {
    city: "Ann Arbor",
    state: "MI",
    zip: "48104",
    utcOffset: -4,
    plant: "DETROIT MI DISTRIBUTION CENTER",
    via: [DENVER_NDC, CHICAGO_NDC],
    days: [5, 6],
  },
  columbus: {
    city: "Columbus",
    state: "OH",
    zip: "43215",
    utcOffset: -4,
    plant: "COLUMBUS OH DISTRIBUTION CENTER",
    via: [DENVER_NDC, CHICAGO_NDC],
    days: [5, 6],
  },
  nashville: {
    city: "Nashville",
    state: "TN",
    zip: "37206",
    utcOffset: -5,
    plant: "NASHVILLE TN DISTRIBUTION CENTER",
    via: [DENVER_NDC, ATLANTA_NDC],
    days: [5, 6],
  },
  atlanta: {
    city: "Atlanta",
    state: "GA",
    zip: "30307",
    utcOffset: -4,
    plant: "ATLANTA GA DISTRIBUTION CENTER",
    via: [DENVER_NDC, ATLANTA_NDC],
    days: [5, 6],
  },
  savannah: {
    city: "Savannah",
    state: "GA",
    zip: "31401",
    utcOffset: -4,
    plant: "SAVANNAH GA DISTRIBUTION CENTER",
    via: [DENVER_NDC, ATLANTA_NDC],
    days: [5, 6],
  },
  asheville: {
    city: "Asheville",
    state: "NC",
    zip: "28801",
    utcOffset: -4,
    plant: "ASHEVILLE NC DISTRIBUTION CENTER",
    via: [DENVER_NDC, ATLANTA_NDC],
    days: [5, 6],
  },
  raleigh: {
    city: "Raleigh",
    state: "NC",
    zip: "27601",
    utcOffset: -4,
    plant: "RALEIGH NC DISTRIBUTION CENTER",
    via: [DENVER_NDC, ATLANTA_NDC],
    days: [5, 6],
  },
  richmond: {
    city: "Richmond",
    state: "VA",
    zip: "23220",
    utcOffset: -4,
    plant: "RICHMOND VA DISTRIBUTION CENTER",
    via: [CHICAGO_NDC, PHILADELPHIA_NDC],
    days: [5, 6],
  },
  philadelphia: {
    city: "Philadelphia",
    state: "PA",
    zip: "19103",
    utcOffset: -4,
    plant: "PHILADELPHIA PA DISTRIBUTION CENTER",
    via: [CHICAGO_NDC, PHILADELPHIA_NDC],
    days: [5, 6],
  },
  brooklyn: {
    city: "Brooklyn",
    state: "NY",
    zip: "11215",
    utcOffset: -4,
    plant: "BROOKLYN NY DISTRIBUTION CENTER",
    via: [CHICAGO_NDC, PHILADELPHIA_NDC],
    days: [5, 6],
  },
  boston: {
    city: "Boston",
    state: "MA",
    zip: "02116",
    utcOffset: -4,
    plant: "BOSTON MA DISTRIBUTION CENTER",
    via: [CHICAGO_NDC, SPRINGFIELD_NDC],
    days: [5, 6],
  },
  burlington: {
    city: "Burlington",
    state: "VT",
    zip: "05401",
    utcOffset: -4,
    plant: "WHITE RIVER JUNCTION VT DISTRIBUTION CENTER",
    via: [CHICAGO_NDC, SPRINGFIELD_NDC],
    days: [5, 7],
  },
  portlandMaine: {
    city: "Portland",
    state: "ME",
    zip: "04101",
    utcOffset: -4,
    plant: "PORTLAND ME DISTRIBUTION CENTER",
    via: [CHICAGO_NDC, SPRINGFIELD_NDC],
    days: [6, 7],
  },
};

/** Where most orders go: the West Coast first, as for a Portland shop. */
const CITY_WEIGHTS: { item: keyof typeof CITIES; weight: number }[] = [
  { item: "portland", weight: 10 },
  { item: "seattle", weight: 8 },
  { item: "oakland", weight: 5 },
  { item: "losAngeles", weight: 6 },
  { item: "sacramento", weight: 3 },
  { item: "sanDiego", weight: 3 },
  { item: "eugene", weight: 3 },
  { item: "spokane", weight: 2 },
  { item: "boise", weight: 2 },
  { item: "saltLake", weight: 2 },
  { item: "denver", weight: 4 },
  { item: "phoenix", weight: 3 },
  { item: "santaFe", weight: 1 },
  { item: "austin", weight: 4 },
  { item: "dallas", weight: 2 },
  { item: "kansasCity", weight: 1 },
  { item: "minneapolis", weight: 3 },
  { item: "madison", weight: 1 },
  { item: "chicago", weight: 4 },
  { item: "annArbor", weight: 1 },
  { item: "columbus", weight: 1 },
  { item: "nashville", weight: 2 },
  { item: "atlanta", weight: 2 },
  { item: "asheville", weight: 1 },
  { item: "raleigh", weight: 1 },
  { item: "richmond", weight: 1 },
  { item: "philadelphia", weight: 2 },
  { item: "brooklyn", weight: 4 },
  { item: "boston", weight: 2 },
  { item: "burlington", weight: 1 },
  { item: "portlandMaine", weight: 1 },
];

const FIRST = [
  "Ava",
  "Liam",
  "Maya",
  "Noah",
  "Elena",
  "Owen",
  "Zoe",
  "Mateo",
  "Clara",
  "Theo",
  "Nadia",
  "Julian",
  "Ruth",
  "Kofi",
  "Hana",
  "Diego",
  "Iris",
  "Felix",
  "Leah",
  "Arjun",
  "Mira",
  "Caleb",
  "Sofia",
  "Ezra",
  "Tara",
  "Rafael",
  "Wren",
  "Samir",
  "Lucy",
  "Andre",
  "Greta",
  "Malik",
  "June",
  "Tomas",
  "Esme",
  "Ian",
  "Paige",
  "Omar",
  "Celia",
  "Reid",
  "Anya",
  "Marcus",
  "Ines",
  "Graham",
  "Lila",
  "Dev",
  "Rosa",
  "Abel",
  "Nell",
  "Kenji",
  "Vera",
  "Simon",
  "Alma",
  "Hugo",
  "Freya",
  "Emmett",
  "Dalia",
  "Jonah",
  "Ivy",
  "Cyrus",
];

const LAST = [
  "Alvarez",
  "Brennan",
  "Carver",
  "Delgado",
  "Ellison",
  "Farrow",
  "Gallo",
  "Hartley",
  "Iwasaki",
  "Jansen",
  "Kowalski",
  "Lindqvist",
  "Marsh",
  "Novak",
  "Okonkwo",
  "Pruitt",
  "Quintero",
  "Rasmussen",
  "Sandoval",
  "Thornton",
  "Underwood",
  "Vance",
  "Whitlock",
  "Yoder",
  "Zamora",
  "Ashby",
  "Bishara",
  "Calloway",
  "Dunmore",
  "Esposito",
  "Fairbanks",
  "Gutierrez",
  "Haddad",
  "Ibarra",
  "Kerrigan",
  "Lombardi",
  "Mendez",
  "Nakamura",
  "Oduya",
  "Pereira",
  "Rhee",
  "Sorensen",
  "Tanaka",
  "Vargas",
  "Waverly",
  "Albright",
  "Beaumont",
  "Castellano",
  "Driscoll",
  "Engstrom",
  "Fennimore",
  "Galloway",
];

const STREETS = [
  "Maple Ave",
  "Linden St",
  "Cedar Ln",
  "Oak Grove Rd",
  "Fremont St",
  "Hawthorne Blvd",
  "Willow Way",
  "Juniper St",
  "Alder St",
  "Sycamore Dr",
  "Birch Ct",
  "Elm St",
  "Magnolia Ave",
  "Chestnut St",
  "Larch Pl",
  "Spruce St",
  "Aspen Dr",
  "Laurel Ave",
  "Holly St",
  "Poplar Ln",
  "Rosewood Ave",
  "Orchard St",
  "Harbor View Dr",
  "Mill St",
  "Prospect Ave",
  "Garfield St",
  "Lincoln Ave",
  "Washington St",
  "Park Ave",
  "Highland Ave",
  "Union St",
  "College Ave",
  "River Rd",
  "Lake St",
];

const MAIL = ["example.com", "example.net", "example.org"];

/** A plausible email at a reserved example domain. */
export function emailFor(name: string, rng: Rng): string {
  const [first = "buyer", last = ""] = name.toLowerCase().split(" ");
  const style = rng.int(0, 3);
  const local =
    style === 0
      ? `${first}.${last}`
      : style === 1
        ? `${first}${last}`
        : style === 2
          ? `${first[0]}${last}`
          : `${first}.${last}${rng.int(2, 98)}`;
  return `${local}@${rng.pick(MAIL)}`;
}

export function randomBuyer(rng: Rng): Buyer {
  const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
  return { name, email: emailFor(name, rng) };
}

export function randomCity(rng: Rng): City {
  return CITIES[rng.weighted(CITY_WEIGHTS)]!;
}

export function randomAddress(rng: Rng, city: City): Address {
  const line1 = `${rng.int(12, 4890)} ${rng.pick(STREETS)}`;
  const apartment = rng.chance(0.28)
    ? `Apt ${rng.int(1, 28)}${rng.pick(["", "A", "B", "C"])}`
    : undefined;
  return addressIn(city, line1, apartment);
}

export function addressIn(city: City, line1: string, line2?: string): Address {
  const address: Address = {
    line1,
    city: city.city,
    state: city.state,
    postalCode: city.zip,
    country: "US",
  };
  if (line2) address.line2 = line2;
  return address;
}

/** The city record for an address the seed made. */
export function cityOf(address: Address): City {
  const found = Object.values(CITIES).find(
    (c) =>
      c.zip === address.postalCode.slice(0, 5) ||
      (c.city === address.city && c.state === address.state),
  );
  return found ?? CITIES.portland!;
}
