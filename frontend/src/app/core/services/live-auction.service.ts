import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { initializeApp } from 'firebase/app';
import { getDatabase, limitToLast, onValue, orderByChild, query, ref } from 'firebase/database';
import { environment } from '../../../environments/environment';
import { LiveAuction, LiveBid } from '../models/models';

/**
 * Lectura en tiempo real desde Firebase RTDB. El navegador solo LEE;
 * las pujas se envían a la API, que valida y escribe en Firebase.
 */
@Injectable({ providedIn: 'root' })
export class LiveAuctionService {
  private db = getDatabase(initializeApp(environment.firebase));
  private root = environment.rtdbRoot;

  /** Diferencia entre el reloj local y el de Firebase (para que el temporizador sea igual para todos). */
  readonly serverOffset = signal(0);

  constructor() {
    onValue(ref(this.db, '.info/serverTimeOffset'), (snap) => this.serverOffset.set(snap.val() ?? 0));
  }

  auction(auctionId: string): Observable<LiveAuction | null> {
    return new Observable((sub) =>
      onValue(ref(this.db, `${this.root}/auctions/${auctionId}`),
        (snap) => sub.next(snap.val() as LiveAuction | null),
        (err) => sub.error(err)));
  }

  /** Todas las subastas (resumen ligero) para refrescar precios en el catálogo. */
  allAuctions(): Observable<Record<string, LiveAuction>> {
    return new Observable((sub) =>
      onValue(ref(this.db, `${this.root}/auctions`),
        (snap) => sub.next((snap.val() ?? {}) as Record<string, LiveAuction>),
        (err) => sub.error(err)));
  }

  bids(auctionId: string, limit = 100): Observable<LiveBid[]> {
    const q = query(ref(this.db, `${this.root}/auctionBids/${auctionId}`), orderByChild('createdAt'), limitToLast(limit));
    return new Observable((sub) =>
      onValue(q, (snap) => {
        const list: LiveBid[] = [];
        snap.forEach((child) => { list.push({ key: child.key!, ...child.val() }); });
        sub.next(list);
      }, (err) => sub.error(err)));
  }
}
