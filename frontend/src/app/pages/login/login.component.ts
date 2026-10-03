import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { ApiError } from '../../core/models/models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="screen">
      <a routerLink="/" class="brand" aria-label="Martillo Autos, inicio">
        <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#E9730C"/><path d="M9 21h14M12 21l4-11 4 11" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>Martillo <b>Autos</b></span>
      </a>

      <div class="card">
        @if (mode() === 'login') {
          <h1>Bienvenido</h1>
          <p class="lead">Inicia sesión para ofertar y publicar vehículos.</p>

          <form (ngSubmit)="login()" novalidate>
            <div class="field">
              <label for="email">Correo electrónico</label>
              <input id="email" class="input" type="email" name="email" autocomplete="email" required [(ngModel)]="email">
            </div>
            <div class="field">
              <label for="password">Contraseña</label>
              <div class="pass">
                <input id="password" class="input" [type]="showPass() ? 'text' : 'password'" name="password"
                       autocomplete="current-password" required [(ngModel)]="password">
                <button type="button" class="eye" (click)="showPass.set(!showPass())">{{ showPass() ? 'Ocultar' : 'Mostrar' }}</button>
              </div>
            </div>
            @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
            <button class="btn btn-primary btn-block" type="submit" [disabled]="busy() || !email || !password">
              {{ busy() ? 'Iniciando…' : 'Iniciar sesión' }}
            </button>
          </form>

          <div class="divider"><span>o</span></div>
          <button class="btn btn-outline btn-block" (click)="switchTo('register')">Crear una cuenta</button>

          <details class="demo">
            <summary>Cuentas de prueba</summary>
            <p>Contraseña para las tres: <code>Demo2026!</code></p>
            <div class="demo-list">
              @for (u of demoUsers; track u) {
                <button type="button" (click)="email = u; password = 'Demo2026!'">{{ u }}</button>
              }
            </div>
          </details>
        } @else {
          <h1>Crear cuenta</h1>
          <p class="lead">Necesitas una cuenta para ofertar o publicar.</p>

          <form (ngSubmit)="register()" novalidate>
            <div class="row">
              <div class="field">
                <label for="fn">Nombre</label>
                <input id="fn" class="input" name="firstName" autocomplete="given-name" [(ngModel)]="reg.firstName" [class.invalid]="!!fieldErrors()['firstName']">
                @if (fieldErrors()['firstName']) { <span class="field-error">{{ fieldErrors()['firstName'] }}</span> }
              </div>
              <div class="field">
                <label for="ln">Apellido</label>
                <input id="ln" class="input" name="lastName" autocomplete="family-name" [(ngModel)]="reg.lastName" [class.invalid]="!!fieldErrors()['lastName']">
                @if (fieldErrors()['lastName']) { <span class="field-error">{{ fieldErrors()['lastName'] }}</span> }
              </div>
            </div>
            <div class="field">
              <label for="re">Correo electrónico</label>
              <input id="re" class="input" type="email" name="email" autocomplete="email" [(ngModel)]="reg.email" [class.invalid]="!!fieldErrors()['email']">
              @if (fieldErrors()['email']) { <span class="field-error">{{ fieldErrors()['email'] }}</span> }
            </div>
            <div class="field">
              <label for="ph">Teléfono</label>
              <input id="ph" class="input" type="tel" name="phone" autocomplete="tel" placeholder="+502 5555 5555" [(ngModel)]="reg.phone" [class.invalid]="!!fieldErrors()['phone']">
              @if (fieldErrors()['phone']) { <span class="field-error">{{ fieldErrors()['phone'] }}</span> }
            </div>
            <div class="field">
              <label for="rp">Contraseña</label>
              <div class="pass">
                <input id="rp" class="input" [type]="showPass() ? 'text' : 'password'" name="password" autocomplete="new-password"
                       [ngModel]="reg.password" (ngModelChange)="reg.password = $event; pass.set($event)" [class.invalid]="!!fieldErrors()['password']">
                <button type="button" class="eye" (click)="showPass.set(!showPass())">{{ showPass() ? 'Ocultar' : 'Mostrar' }}</button>
              </div>
              <ul class="rules">
                @for (r of passwordRules(); track r.label) {
                  <li [class.ok]="r.ok">{{ r.label }}</li>
                }
              </ul>
            </div>
            @if (error()) { <p class="alert" role="alert">{{ error() }}</p> }
            <button class="btn btn-primary btn-block" type="submit" [disabled]="busy() || !strong()">
              {{ busy() ? 'Creando cuenta…' : 'Crear cuenta' }}
            </button>
          </form>
          <p class="switch">¿Ya tienes cuenta? <button class="link" (click)="switchTo('login')">Inicia sesión</button></p>
        }
      </div>
    </section>
  `,
  styles: [`
    .screen { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 28px 16px 56px; gap: 36px; }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font-size: 1.35rem; }
    .brand b { color: var(--signal); }
    .card { width: 100%; max-width: 420px; background: var(--paper); border-radius: 14px; box-shadow: var(--shadow-panel); padding: 36px 32px 28px; }
    h1 { text-align: center; font-size: 2rem; font-weight: 500; }
    .lead { text-align: center; color: var(--ink-soft); margin: 8px 0 24px; }
    form { display: flex; flex-direction: column; gap: 16px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .pass { position: relative; }
    .pass .input { padding-right: 82px; }
    .eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: none; color: var(--signal); font-size: .82rem; font-weight: 600; cursor: pointer; padding: 6px 8px; }
    .rules { list-style: none; padding: 0; margin: 4px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; font-size: .78rem; color: var(--ink-faint); }
    .rules li::before { content: '○ '; }
    .rules li.ok { color: var(--dmg-green); }
    .rules li.ok::before { content: '● '; }
    .alert { margin: 0; background: var(--dmg-red-soft); color: #b23434; padding: 10px 12px; border-radius: var(--radius-field); font-size: .9rem; }
    .divider { display: flex; align-items: center; gap: 12px; color: var(--ink-faint); margin: 20px 0; font-size: .9rem; }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }
    .switch { text-align: center; margin: 18px 0 0; color: var(--ink-soft); }
    .link { border: 0; background: none; text-decoration: underline; font-weight: 600; cursor: pointer; color: var(--ink); }
    .demo { margin-top: 22px; border-top: 1px solid var(--line); padding-top: 14px; font-size: .88rem; color: var(--ink-soft); }
    .demo summary { cursor: pointer; font-weight: 600; color: var(--ink); }
    .demo code { background: var(--canvas); padding: 1px 6px; border-radius: 4px; }
    .demo-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .demo-list button { border: 1px solid var(--line-strong); background: var(--paper); border-radius: var(--radius-pill); padding: 4px 12px; cursor: pointer; font-size: .82rem; }
    .demo-list button:hover { border-color: var(--signal); }
    @media (max-width: 460px) { .card { padding: 28px 20px; } .row { grid-template-columns: 1fr; } }
  `],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly demoUsers = ['ana@demo.gt', 'carlos@demo.gt', 'sofia@demo.gt'];

  mode = signal<'login' | 'register'>(this.route.snapshot.queryParamMap.get('modo') === 'registro' ? 'register' : 'login');
  busy = signal(false);
  error = signal('');
  fieldErrors = signal<Record<string, string>>({});
  showPass = signal(false);

  email = '';
  password = '';
  reg = { firstName: '', lastName: '', email: '', phone: '', password: '' };
  pass = signal('');

  passwordRules = computed(() => {
    const p = this.pass();
    return [
      { label: '8 caracteres o más', ok: p.length >= 8 },
      { label: 'Una mayúscula', ok: /[A-Z]/.test(p) },
      { label: 'Una minúscula', ok: /[a-z]/.test(p) },
      { label: 'Un número', ok: /\d/.test(p) },
      { label: 'Un símbolo', ok: /[^A-Za-z0-9]/.test(p) },
    ];
  });
  strong = computed(() => this.passwordRules().every((r) => r.ok));

  switchTo(mode: 'login' | 'register'): void {
    this.mode.set(mode);
    this.error.set('');
    this.fieldErrors.set({});
  }

  login(): void {
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.done(),
      error: (e: HttpErrorResponse) => this.fail(e),
    });
  }

  register(): void {
    this.busy.set(true);
    this.error.set('');
    this.fieldErrors.set({});
    this.auth.register(this.reg).subscribe({
      next: () => this.done(),
      error: (e: HttpErrorResponse) => this.fail(e),
    });
  }

  private done(): void {
    this.busy.set(false);
    this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/');
  }

  private fail(e: HttpErrorResponse): void {
    this.busy.set(false);
    const body = e.error as ApiError | null;
    this.fieldErrors.set(body?.errors ?? {});
    this.error.set(e.status === 0 ? 'No hay conexión con el servidor. Intenta de nuevo en unos segundos.' : body?.message ?? 'Algo falló. Intenta de nuevo.');
  }
}
