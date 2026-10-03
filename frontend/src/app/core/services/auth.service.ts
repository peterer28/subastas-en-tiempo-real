import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, User } from '../models/models';

const STORAGE_KEY = 'martillo.session';

interface Session { token: string; user: User; expiresAt: number; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private session = signal<Session | null>(this.restore());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);

  get token(): string | null {
    const s = this.session();
    if (s && s.expiresAt < Date.now()) { this.logout(false); return null; }
    return s?.token ?? null;
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap((r) => this.save(r)));
  }

  register(data: { firstName: string; lastName: string; email: string; phone: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/register`, data)
      .pipe(tap((r) => this.save(r)));
  }

  logout(redirect = true): void {
    localStorage.removeItem(STORAGE_KEY);
    this.session.set(null);
    if (redirect) this.router.navigateByUrl('/');
  }

  private save(r: AuthResponse): void {
    const payload = JSON.parse(atob(r.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const session: Session = { token: r.token, user: r.user, expiresAt: payload.exp * 1000 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.session.set(session);
  }

  private restore(): Session | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s: Session = JSON.parse(raw);
      return s.expiresAt > Date.now() ? s : null;
    } catch {
      return null;
    }
  }
}
