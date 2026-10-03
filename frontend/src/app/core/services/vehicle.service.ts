import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Catalogs, Facets, Page, VehicleCard, VehicleDetail } from '../models/models';

export interface CatalogQuery {
  tab?: 'open' | 'closed';
  search?: string;
  itemTypeId?: number[];
  makeId?: number[];
  modelId?: number[];
  fuelTypeId?: number[];
  transmissionId?: number[];
  drivetrainId?: number[];
  cylinders?: number[];
  damage?: string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  sort?: string;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class VehicleService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;
  private catalogs$?: Observable<Catalogs>;

  photoUrl(id: string | null | undefined): string {
    return id ? `${this.api}/photos/${id}` : 'favicon.svg';
  }

  catalogs(): Observable<Catalogs> {
    this.catalogs$ ??= this.http.get<Catalogs>(`${this.api}/catalogs`).pipe(shareReplay(1));
    return this.catalogs$;
  }

  list(q: CatalogQuery): Observable<Page<VehicleCard>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(q)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) { if (value.length) params = params.set(key, value.join(',')); }
      else params = params.set(key, String(value));
    }
    return this.http.get<Page<VehicleCard>>(`${this.api}/vehicles`, { params });
  }

  facets(tab: 'open' | 'closed'): Observable<Facets> {
    return this.http.get<Facets>(`${this.api}/vehicles/facets`, { params: { tab } });
  }

  detail(id: string): Observable<VehicleDetail> {
    return this.http.get<VehicleDetail>(`${this.api}/vehicles/${id}`);
  }

  mine(search = ''): Observable<VehicleCard[]> {
    return this.http.get<VehicleCard[]>(`${this.api}/vehicles/mine`, { params: search ? { search } : {} });
  }

  create(form: FormData): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.api}/vehicles`, form);
  }

  update(id: string, form: FormData): Observable<{ id: string }> {
    return this.http.put<{ id: string }>(`${this.api}/vehicles/${id}`, form);
  }

  myBidderIdentity(auctionId: string): Observable<{ bidderToken: string; alias: string }> {
    return this.http.get<{ bidderToken: string; alias: string }>(`${this.api}/auctions/${auctionId}/me`);
  }

  placeBid(auctionId: string, amount: number): Observable<{ currentBid: number; nextMinBid: number; endsAt: number }> {
    return this.http.post<{ currentBid: number; nextMinBid: number; endsAt: number }>(
      `${this.api}/auctions/${auctionId}/bids`, { amount });
  }
}
