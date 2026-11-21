import 'server-only';
import data from './data.json';
import { createSearchPlaces } from './search';
import type { PlacesData } from './types';

/** 伺服器端專用:城市資料約 2.3MB,超過前端 1.5MB 上限,由 /api/places 查詢。 */
export const searchPlaces = createSearchPlaces(data as unknown as PlacesData);
