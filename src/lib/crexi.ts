const API = "https://api.crexi.com";
const BROKERAGE = "Covenant Cre";

/** Crexi rejects requests that don't look like they came from their own SPA. */
const HEADERS = {
  accept: "application/json, text/plain, */*",
  origin: "https://www.crexi.com",
  referer: "https://www.crexi.com/",
};

export interface SearchItem {
  /** e.g. `sales-1913987` / `lease-814146`. Sales and lease ids are separate namespaces. */
  id: string;
  documentType: "Sales" | "Lease";
  propertyName: string;
  description: string | null;
  urlSlug: string;
  updatedOn: string;
  propertyPrice?: { total?: number; perSqft?: number; perAcre?: number };
  propertyAttributes: {
    type?: string;
    subType?: string;
    buildingSqft?: number;
    buildingsCount?: number;
    classType?: string;
    ceilingHeightFt?: number;
    loadingDocksCount?: number;
  };
  lotAttributes?: { sizeAcre?: number };
  /** Preformatted rate strings, e.g. `{ perSqftAnnual: "$22", totalMonthly: "$2,500" }`. */
  leaseRateRange?: Partial<
    Record<
      "perSqftAnnual" | "perSqftMonthly" | "perAcreAnnual" | "perAcreMonthly" | "totalAnnual" | "totalMonthly",
      string
    >
  >;
  leaseDetails?: Array<{
    rentableSqft?: number;
    rentableSqftMin?: number;
    rentableSqftMax?: number;
    rentableAcre?: number;
    rateType?: string;
    leaseType?: string;
  }>;
  tenancy?: { tenancyType?: string };
  vacancyDetails?: { vacantUnitsCount?: number };
  constructionYear?: { built?: number; renovated?: number };
  gallery: { imageCount: number; thumbnailUrls: string[] };
  listingAttributes: { status: string; dateActivated?: string };
  address: Array<{
    fullAddress: string;
    streetAddress: string;
    city: string;
    county: string;
    neighborhood?: string;
    stateCode: string;
    zip: string;
    location: { lat: number; lon: number };
  }>;
  brokers: Array<{ name: string; brokerage: string; thumbnailUrl?: string }>;
}

export interface Asset {
  id: number;
  name: string;
  description: string | null;
  marketingDescription: string | null;
  urlSlug: string;
  status: string;
  types: string[];
  subtypes: string[];
  askingPrice: number | null;
  isUnpriced: boolean;
  isSold: boolean;
  isPaused: boolean;
  isPrivate: boolean;
  thumbnailUrl: string | null;
  activatedOn: string;
  updatedOn: string;
  isInOpportunityZone: boolean;
  details: Record<string, string>;
  locations: Array<{
    address: string;
    city: string;
    county: string;
    zip: string;
    state: { code: string; name: string };
    latitude: number;
    longitude: number;
  }>;
}

export interface GalleryImage {
  id: number;
  type: string;
  imageUrl: string;
  bigTnUrl: string;
  mediumTnUrl: string;
  smallTnUrl: string;
}

export interface AssetBroker {
  id: number;
  firstName: string;
  lastName: string;
  thumbnailUrl: string | null;
  publicProfileId: string | null;
  licenseDetails: Array<{ brokerTitle: string | null; brokerageLicensePhone: string | null }>;
}

/** Throws rather than degrading: a failed fetch must fail the build, not ship an empty listings page. */
async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...HEADERS, ...init?.headers },
  });
  if (!res.ok) throw new Error(`Crexi ${path} responded ${res.status}`);
  return (await res.json()) as T;
}

/** Sales listings are "On-Market" etc.; lease listings use "Active" and reject the sales status filter. */
const LIVE_STATUSES = new Set(["On-Market", "Auction", "Highest & Best", "Call For Offers", "Active"]);

export const PAGE_SIZE = 12;

/** Every page is built in one process, so each search runs once per build. */
const searches = new Map<string, Promise<SearchItem[]>>();

function search(searchType: "Sales" | "Lease"): Promise<SearchItem[]> {
  const cached = searches.get(searchType);
  if (cached) return cached;
  const pending = runSearch(searchType);
  searches.set(searchType, pending);
  return pending;
}

const BATCH_SIZE = 100;

async function runSearch(searchType: "Sales" | "Lease"): Promise<SearchItem[]> {
  const items: SearchItem[] = [];
  let totalCount = Infinity;

  while (items.length < totalCount) {
    const data = await get<{ items: SearchItem[]; totalCount: number }>("/universal-search/v2/search", {
      method: "POST",
      headers: { "content-type": "application/json", "schema-mode": "Searchable", "x-skip-interceptor": "true" },
      body: JSON.stringify({
        filters: {
          "broker.brokerage": { mode: "Include", type: "Plain", structuredValues: [BROKERAGE], values: [] },
        },
        excludeFilters: [],
        excludeSort: [],
        from: items.length,
        ids: [],
        searchTypes: [searchType],
        size: BATCH_SIZE,
        sorting: { "searchAttributes.crexiSearchRank": "Descending" },
      }),
    });

    if (!data.items?.length) break;
    items.push(...data.items);
    totalCount = data.totalCount;
  }

  return items.filter((item) => LIVE_STATUSES.has(item.listingAttributes?.status));
}

export async function searchListings(): Promise<SearchItem[]> {
  const [sales, lease] = await Promise.all([search("Sales"), search("Lease")]);
  return [...sales, ...lease];
}

export const getAsset = (id: string | number) =>
  get<Asset>(`/assets/${id}`, { headers: { "x-xt-universal-pdp": "true" } });

export const getGallery = (id: string | number) => get<GalleryImage[]>(`/assets/${id}/gallery`);

export const getBrokers = (id: string | number) => get<AssetBroker[]>(`/assets/${id}/brokers`);

export const assetId = (searchId: string) => searchId.replace(/^\D+-/, "");

export const isLease = (item: SearchItem) => item.documentType === "Lease";

/**
 * Lease detail lives on api-lease.crexi.com, which sits behind a Cloudflare bot
 * challenge that blocks server-side fetches, so lease cards link out to Crexi.
 */
export const listingHref = (item: SearchItem) =>
  isLease(item) ? `https://www.crexi.com/lease/properties/${assetId(item.id)}` : `/listings/${assetId(item.id)}`;

/**
 * Crexi's `totalAnnual`/`totalMonthly` are unreliable (they sometimes echo the
 * per-SF rate), so only the per-SF figures are surfaced.
 */
export function leaseRate(item: SearchItem) {
  const monthly = item.leaseDetails?.[0]?.rateType === "Per Month";
  const rate = monthly ? item.leaseRateRange?.perSqftMonthly : item.leaseRateRange?.perSqftAnnual;
  return rate ? `${rate} /SF/${monthly ? "mo" : "yr"}` : null;
}

/** e.g. `1,775 – 10,000 SF` for a multi-space listing. */
export function leaseSqftRange(item: SearchItem) {
  const space = item.leaseDetails?.[0];
  const min = formatNumber(space?.rentableSqftMin);
  const max = formatNumber(space?.rentableSqftMax);
  if (!min) return null;
  return min === max ? `${min} SF` : `${min} – ${max} SF`;
}

export function formatPrice(value?: number | null) {
  if (!value) return null;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatNumber(value?: number | null, maximumFractionDigits = 0) {
  if (value === undefined || value === null) return null;
  return value.toLocaleString("en-US", { maximumFractionDigits });
}
