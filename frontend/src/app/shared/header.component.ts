import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [FormsModule, RouterLink, RouterLinkActive],
  template: `
    <header class="top">
      <div class="wrap bar">
        <a routerLink="/" class="brand" aria-label="Martillo Autos, inicio">
          <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#E9730C"/>
            <path d="M9 21h14M12 21l4-11 4 11" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Martillo <b>Autos</b></span>
        </a>

        <form class="search" role="search" (ngSubmit)="search()">
          <input [(ngModel)]="term" name="q" type="search" placeholder="Marca, modelo, año, lote o ubicación"
                 aria-label="Buscar vehículos">
          <button type="submit" aria-label="Buscar">
            <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </form>

        <div class="actions">
          @if (auth.user(); as user) {
            <div class="user">
              <button class="btn btn-quiet avatar-btn" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()">
                <span class="avatar">{{ user.firstName[0] }}{{ user.lastName[0] }}</span>
                {{ user.firstName }}
              </button>
              @if (menuOpen()) {
                <div class="menu" (click)="menuOpen.set(false)">
                  <a routerLink="/publicar">Publicar vehículo</a>
                  <a routerLink="/mis-publicaciones">Mis publicaciones</a>
                  <button (click)="auth.logout()">Cerrar sesión</button>
                </div>
              }
            </div>
          } @else {
            <a class="btn btn-primary" routerLink="/login">Iniciar sesión</a>
            <a class="btn btn-outline hide-sm" routerLink="/login" [queryParams]="{ modo: 'registro' }">Crear cuenta</a>
          }
        </div>
      </div>
      <nav class="sub">
        <div class="wrap links">
          <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Inventario</a>
          <a routerLink="/publicar" routerLinkActive="on">Vender ahora</a>
          <a routerLink="/mis-publicaciones" routerLinkActive="on">Mis publicaciones</a>
          <span class="how">Regístrese, encuentre y oferte</span>
        </div>
      </nav>
    </header>
  `,
  styles: [`
    .top { background: var(--paper); border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 50; }
    .bar { display: flex; align-items: center; gap: 24px; height: 64px; }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font-size: 1.15rem; font-weight: 500; white-space: nowrap; }
    .brand b { font-weight: 700; color: var(--signal); }
    .search { flex: 1; max-width: 560px; display: flex; align-items: center; border: 1px solid var(--line-strong);
              border-radius: var(--radius-pill); padding: 0 6px 0 16px; background: var(--paper); }
    .search:focus-within { border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-soft); }
    .search input { flex: 1; border: 0; outline: 0; height: 38px; background: transparent; min-width: 0; }
    .search button { border: 0; background: none; color: var(--ink-soft); cursor: pointer; padding: 6px; display: flex; }
    .actions { margin-left: auto; display: flex; gap: 10px; align-items: center; }
    .user { position: relative; }
    .avatar-btn { padding: 5px 14px 5px 5px; }
    .avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--signal-soft); color: var(--signal);
              display: grid; place-items: center; font-size: .75rem; font-weight: 700; }
    .menu { position: absolute; right: 0; top: calc(100% + 8px); background: var(--paper); border: 1px solid var(--line);
            border-radius: var(--radius-card); box-shadow: var(--shadow-panel); min-width: 210px; padding: 6px; display: flex; flex-direction: column; }
    .menu a, .menu button { text-align: left; padding: 10px 12px; border-radius: 6px; text-decoration: none; border: 0; background: none; cursor: pointer; }
    .menu a:hover, .menu button:hover { background: var(--canvas); }
    .sub { border-top: 1px solid var(--line); }
    .links { display: flex; gap: 28px; height: 46px; align-items: center; font-size: .9rem; overflow-x: auto; }
    .links a { text-decoration: none; color: var(--ink-soft); padding: 12px 0; border-bottom: 2px solid transparent; white-space: nowrap; }
    .links a.on, .links a:hover { color: var(--ink); border-bottom-color: var(--signal); }
    .how { margin-left: auto; color: var(--ink-faint); white-space: nowrap; }
    @media (max-width: 760px) {
      .bar { flex-wrap: wrap; height: auto; padding-top: 10px; padding-bottom: 10px; gap: 10px; }
      .search { order: 3; max-width: none; flex-basis: 100%; }
      .hide-sm, .how { display: none; }
    }
  `],
})
export class HeaderComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  menuOpen = signal(false);
  term = inject(ActivatedRoute).snapshot.queryParamMap.get('search') ?? '';

  search(): void {
    this.router.navigate(['/'], { queryParams: { search: this.term.trim() || null } });
  }
}
