// Where maps open before there's data to fit to. Set NEXT_PUBLIC_MAP_CENTER="lat,lng" for your city.
const [lat, lng] = (process.env.NEXT_PUBLIC_MAP_CENTER ?? "31.52,74.35").split(",").map(Number);

export const MAP_CENTER: [number, number] = [lat, lng];

export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
