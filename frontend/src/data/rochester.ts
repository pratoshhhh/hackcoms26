import type { LngLat } from "@/utils/geo";

export const ROCHESTER_CENTER: LngLat = [-77.6109, 43.1566];
export const ROCHESTER_ZOOM = 12.6;
/** Overpass bbox: south, west, north, east */
export const ROCHESTER_BBOX = [43.1, -77.7, 43.23, -77.53] as const;

export interface Neighborhood {
  name: string;
  city: string;
  center: LngLat;
}

// Approximate neighborhood centroids. Used to label hydrants by nearest centroid.
export const NEIGHBORHOODS: Neighborhood[] = [
  { name: "Downtown", city: "Rochester, NY", center: [-77.6088, 43.1566] },
  { name: "Corn Hill", city: "Rochester, NY", center: [-77.617, 43.1475] },
  { name: "South Wedge", city: "Rochester, NY", center: [-77.604, 43.143] },
  { name: "Park Avenue", city: "Rochester, NY", center: [-77.581, 43.144] },
  { name: "Neighborhood of the Arts", city: "Rochester, NY", center: [-77.587, 43.158] },
  { name: "Swillburg", city: "Rochester, NY", center: [-77.593, 43.133] },
  { name: "Highland Park", city: "Rochester, NY", center: [-77.605, 43.13] },
  { name: "Upper Monroe", city: "Rochester, NY", center: [-77.58, 43.129] },
  { name: "Cobbs Hill", city: "Rochester, NY", center: [-77.564, 43.136] },
  { name: "Browncroft", city: "Rochester, NY", center: [-77.56, 43.16] },
  { name: "North Winton Village", city: "Rochester, NY", center: [-77.559, 43.168] },
  { name: "Beechwood", city: "Rochester, NY", center: [-77.58, 43.166] },
  { name: "Marketview Heights", city: "Rochester, NY", center: [-77.599, 43.165] },
  { name: "Upper Falls", city: "Rochester, NY", center: [-77.608, 43.175] },
  { name: "Homestead Heights", city: "Rochester, NY", center: [-77.585, 43.188] },
  { name: "Susan B. Anthony", city: "Rochester, NY", center: [-77.628, 43.153] },
  { name: "Plymouth-Exchange", city: "Rochester, NY", center: [-77.618, 43.14] },
  { name: "19th Ward", city: "Rochester, NY", center: [-77.637, 43.138] },
  { name: "Genesee-Jefferson", city: "Rochester, NY", center: [-77.628, 43.133] },
  { name: "Mount Hope", city: "Rochester, NY", center: [-77.615, 43.128] },
  { name: "Dutchtown", city: "Rochester, NY", center: [-77.624, 43.163] },
  { name: "Edgerton", city: "Rochester, NY", center: [-77.63, 43.17] },
  { name: "Lyell-Otis", city: "Rochester, NY", center: [-77.653, 43.173] },
  { name: "Maplewood", city: "Rochester, NY", center: [-77.638, 43.188] },
  { name: "Gates", city: "Gates, NY", center: [-77.69, 43.155] },
  { name: "Brighton", city: "Brighton, NY", center: [-77.57, 43.118] },
];

export interface Street {
  name: string;
  path: LngLat[];
}

// Simplified centrelines of major streets (approximate). Used for "near <street>" labels and street search.
export const STREETS: Street[] = [
  { name: "East Ave", path: [[-77.6, 43.156], [-77.558, 43.1405]] },
  { name: "Monroe Ave", path: [[-77.604, 43.153], [-77.56, 43.124]] },
  { name: "Park Ave", path: [[-77.594, 43.15], [-77.565, 43.138]] },
  { name: "University Ave", path: [[-77.598, 43.159], [-77.565, 43.155]] },
  { name: "Lake Ave", path: [[-77.625, 43.164], [-77.618, 43.21]] },
  { name: "Dewey Ave", path: [[-77.633, 43.172], [-77.64, 43.215]] },
  { name: "Genesee St", path: [[-77.635, 43.15], [-77.625, 43.115]] },
  { name: "Mt Hope Ave", path: [[-77.608, 43.145], [-77.615, 43.115]] },
  { name: "South Ave", path: [[-77.606, 43.15], [-77.608, 43.125]] },
  { name: "N Clinton Ave", path: [[-77.607, 43.158], [-77.61, 43.19]] },
  { name: "Hudson Ave", path: [[-77.604, 43.162], [-77.6, 43.2]] },
  { name: "Portland Ave", path: [[-77.597, 43.17], [-77.588, 43.205]] },
  { name: "Culver Rd", path: [[-77.565, 43.135], [-77.56, 43.21]] },
  { name: "Goodman St", path: [[-77.585, 43.13], [-77.59, 43.18]] },
  { name: "Winton Rd", path: [[-77.555, 43.12], [-77.555, 43.18]] },
  { name: "Main St", path: [[-77.65, 43.155], [-77.57, 43.16]] },
  { name: "Lyell Ave", path: [[-77.625, 43.162], [-77.68, 43.172]] },
  { name: "Chili Ave", path: [[-77.63, 43.147], [-77.68, 43.135]] },
  { name: "Thurston Rd", path: [[-77.655, 43.145], [-77.645, 43.125]] },
  { name: "Plymouth Ave", path: [[-77.615, 43.155], [-77.62, 43.13]] },
  { name: "Norton St", path: [[-77.64, 43.188], [-77.57, 43.188]] },
  { name: "Elmwood Ave", path: [[-77.64, 43.123], [-77.57, 43.126]] },
  { name: "Highland Ave", path: [[-77.6, 43.134], [-77.57, 43.13]] },
  { name: "Atlantic Ave", path: [[-77.593, 43.162], [-77.56, 43.164]] },
  { name: "Bay St", path: [[-77.595, 43.17], [-77.56, 43.172]] },
  { name: "Emerson St", path: [[-77.64, 43.172], [-77.67, 43.173]] },
  { name: "Buffalo Rd", path: [[-77.65, 43.158], [-77.7, 43.16]] },
  { name: "Brooks Ave", path: [[-77.64, 43.14], [-77.69, 43.13]] },
];
