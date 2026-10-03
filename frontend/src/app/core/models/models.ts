export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface AuthResponse { token: string; user: User; }

export interface CatalogItem { id: number; name: string; code?: string; makeId?: number; description?: string; colorHex?: string; }

export interface Catalogs {
  itemTypes: CatalogItem[];
  makes: CatalogItem[];
  models: CatalogItem[];
  transmissions: CatalogItem[];
  fuelTypes: CatalogItem[];
  drivetrains: CatalogItem[];
  damageLevels: CatalogItem[];
}

export type DamageCode = 'VERDE' | 'AMARILLO' | 'ROJO';
export type AuctionStatusDb = 'SCHEDULED' | 'LIVE' | 'SOLD' | 'DESERTED' | 'CANCELLED';

export interface VehicleCard {
  id: string;
  lotNumber: number;
  year: number;
  itemType: string;
  make: string;
  model: string;
  engine: string;
  transmission: string;
  fuelType: string;
  drivetrain: string;
  cylinders: number;
  mileage: number | null;
  location: string;
  damage: { code: DamageCode; name: string; description?: string };
  coverPhotoId: string | null;
  photoCount: number;
  auction: {
    id: string;
    basePrice: number;
    currency: string;
    startsAt: string;
    endsAt: string;
    status: AuctionStatusDb;
    currentBid: number | null;
    totalBids: number;
    finalPrice: number | null;
  };
  editable?: boolean;
}

export interface VehicleDetail extends VehicleCard {
  description: string | null;
  photoIds: string[];
  isOwner: boolean;
  ids: {
    itemTypeId: number; makeId: number; modelId: number; transmissionId: number;
    fuelTypeId: number; drivetrainId: number; damageLevelId: number;
  };
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; }

export interface FacetEntry { id: number | string; name: string; count: number; }
export interface Facets {
  itemTypes: FacetEntry[];
  makes: FacetEntry[];
  fuelTypes: FacetEntry[];
  transmissions: FacetEntry[];
  drivetrains: FacetEntry[];
  damage: FacetEntry[];
  tabs: { open: number; closed: number };
}

/** Nodo en Firebase RTDB: subastas/auctions/{auctionId} */
export type LiveStatus = 'scheduled' | 'live' | 'sold' | 'deserted';
export interface LiveAuction {
  vehicleId: string;
  lotNumber: number;
  title: string;
  basePrice: number;
  currency: string;
  minIncrementPct: number;
  softCloseMs: number;
  startsAt: number;
  endsAt: number;
  status: LiveStatus;
  currentBid: number;
  nextMinBid: number;
  bidCount: number;
  leaderToken: string;
  leaderAlias: string;
  lastBidAt: number;
  extensions: number;
  result?: { outcome: 'sold' | 'deserted'; finalPrice: number; closedAt: number };
}

/** Nodo en Firebase RTDB: subastas/auctionBids/{auctionId}/{pushId} */
export interface LiveBid {
  key: string;
  amount: number;
  alias: string;
  bidderToken: string;
  createdAt: number;
}

export type AuctionPhase = 'scheduled' | 'live' | 'final' | 'closed';

export interface ApiError { message: string; errors?: Record<string, string>; nextMinBid?: number; }
