import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { HeaderComponent } from './shared/header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent],
  template: `
    @if (!isLogin()) { <app-header /> }
    <main><router-outlet /></main>
    @if (!isLogin()) {
      <footer class="foot">
        <div class="wrap">Martillo Autos, subastas de vehículos importados en Guatemala. Proyecto académico.</div>
      </footer>
    }
  `,
  styles: [`
    main { min-height: calc(100vh - 170px); }
    .foot { border-top: 1px solid var(--line); background: var(--paper); color: var(--ink-faint); font-size: .85rem; padding: 22px 0; }
  `],
})
export class AppComponent {
  private router = inject(Router);
  isLogin = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.startsWith('/login')),
    ),
    { initialValue: location.pathname.startsWith('/login') },
  );
}
