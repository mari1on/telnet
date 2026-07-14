import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';

type AuthMode = 'login' | 'signup' | 'forgot-request' | 'forgot-reset';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-wrapper">
      <div class="bg-shape bg-shape-1"></div>
      <div class="bg-shape bg-shape-2"></div>
      <div class="bg-shape bg-shape-3"></div>

      <section class="auth-card" aria-live="polite">
        <div class="logo-area">
          <img src="assets/logo.png" alt="TELNET" class="auth-logo" />
        </div>

        <div class="card-header">
          @switch (mode()) {
            @case ('login') {
              <h1>Se connecter</h1>
              <p>Accédez à votre espace sécurisé.</p>
            }
            @case ('signup') {
              <h1>S'inscrire</h1>
              <p>Créez votre compte TELNET.</p>
            }
            @case ('forgot-request') {
              <h1>Mot de passe oublié</h1>
              <p>Recevez un code de sécurité à 6 chiffres par email.</p>
            }
            @case ('forgot-reset') {
              <h1>Nouveau mot de passe</h1>
              <p>Saisissez le code reçu et choisissez un nouveau mot de passe.</p>
            }
          }
        </div>

        @if (errorMsg()) {
          <div class="alert alert-danger">{{ errorMsg() }}</div>
        }
        @if (successMsg()) {
          <div class="alert alert-success">{{ successMsg() }}</div>
        }

        @if (mode() === 'login') {
          <form class="auth-form" (ngSubmit)="onLogin()">
            <div class="form-group">
              <label for="loginIdentifier">Identifiant ou adresse email</label>
              <div class="input-wrapper">
                <input
                  id="loginIdentifier"
                  name="loginIdentifier"
                  class="form-control"
                  type="text"
                  autocomplete="username"
                  [(ngModel)]="loginData.username"
                  [class.has-error]="validationErrors.username"
                  placeholder="Nom d'utilisateur ou email"
                  (input)="clearErrors()"
                />
              </div>
              @if (validationErrors.username) {
                <div class="error-text">{{ validationErrors.username }}</div>
              }
            </div>

            <div class="form-group">
              <label for="loginPassword">Mot de passe</label>
              <div class="input-wrapper">
                <input
                  id="loginPassword"
                  name="loginPassword"
                  class="form-control password-control"
                  [type]="showPassword() ? 'text' : 'password'"
                  autocomplete="current-password"
                  [(ngModel)]="loginData.password"
                  [class.has-error]="validationErrors.password"
                  placeholder="Mot de passe"
                  (input)="clearErrors()"
                />
                <button type="button" class="password-toggle" (click)="togglePassword()" [attr.aria-label]="showPassword() ? 'Masquer le mot de passe' : 'Afficher le mot de passe'">
                  {{ showPassword() ? 'Masquer' : 'Afficher' }}
                </button>
              </div>
              @if (validationErrors.password) {
                <div class="error-text">{{ validationErrors.password }}</div>
              }
            </div>

            <div class="form-options">
              <button type="button" class="link-button" (click)="openForgotPassword()">Mot de passe oublié ?</button>
            </div>

            <button class="submit-btn" type="submit" [disabled]="loading()">
              {{ loading() ? 'Connexion en cours…' : 'Se connecter' }}
            </button>

            <p class="auth-switch">
              Vous n'avez pas de compte ?
              <button type="button" class="link-button strong" (click)="setMode('signup')">S'inscrire</button>
            </p>
          </form>
        }

        @if (mode() === 'signup') {
          <form class="auth-form" (ngSubmit)="onSignup()">
            <div class="form-group">
              <label for="signupUsername">Nom complet (identifiant)</label>
              <div class="input-wrapper">
                <input id="signupUsername" name="signupUsername" class="form-control" type="text" autocomplete="username" [(ngModel)]="signupData.username" [class.has-error]="validationErrors.username" placeholder="Jean Dupont" (input)="clearErrors()" />
              </div>
              @if (validationErrors.username) { <div class="error-text">{{ validationErrors.username }}</div> }
            </div>

            <div class="form-group">
              <label for="signupEmail">Adresse email</label>
              <div class="input-wrapper">
                <input id="signupEmail" name="signupEmail" class="form-control" type="email" autocomplete="email" [(ngModel)]="signupData.email" [class.has-error]="validationErrors.email" placeholder="nom@exemple.com" (input)="clearErrors()" />
              </div>
              @if (validationErrors.email) { <div class="error-text">{{ validationErrors.email }}</div> }
            </div>

            <div class="form-group">
              <label for="signupPassword">Mot de passe</label>
              <div class="input-wrapper">
                <input id="signupPassword" name="signupPassword" class="form-control password-control" [type]="showPassword() ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="signupData.password" [class.has-error]="validationErrors.password" placeholder="Mot de passe sécurisé" (input)="clearErrors()" />
                <button type="button" class="password-toggle" (click)="togglePassword()">{{ showPassword() ? 'Masquer' : 'Afficher' }}</button>
              </div>
              @if (validationErrors.password) { <div class="error-text">{{ validationErrors.password }}</div> }
              <div class="password-help">8 caractères minimum, majuscule, minuscule, chiffre et caractère spécial.</div>
            </div>

            <div class="form-group">
              <label for="signupConfirmPassword">Confirmer le mot de passe</label>
              <div class="input-wrapper">
                <input id="signupConfirmPassword" name="signupConfirmPassword" class="form-control" [type]="showPassword() ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="confirmPasswordValue" [class.has-error]="validationErrors.confirmPassword" placeholder="Confirmez le mot de passe" (input)="clearErrors()" />
              </div>
              @if (validationErrors.confirmPassword) { <div class="error-text">{{ validationErrors.confirmPassword }}</div> }
            </div>

            <button class="submit-btn" type="submit" [disabled]="loading()">
              {{ loading() ? 'Création en cours…' : "S'inscrire" }}
            </button>

            <p class="auth-switch">
              Vous avez déjà un compte ?
              <button type="button" class="link-button strong" (click)="setMode('login')">Se connecter</button>
            </p>
          </form>
        }

        @if (mode() === 'forgot-request') {
          <form class="auth-form" (ngSubmit)="requestResetCode()">
            <div class="form-group">
              <label for="resetIdentifier">Identifiant ou adresse email</label>
              <div class="input-wrapper">
                <input id="resetIdentifier" name="resetIdentifier" class="form-control" type="text" autocomplete="username" [(ngModel)]="resetData.identifier" placeholder="Nom d'utilisateur ou email" />
              </div>
            </div>

            <button class="submit-btn" type="submit" [disabled]="loading()">
              {{ loading() ? 'Envoi en cours…' : 'Envoyer le code' }}
            </button>

            <button type="button" class="back-button" (click)="setMode('login')">← Retour à la connexion</button>
          </form>
        }

        @if (mode() === 'forgot-reset') {
          <form class="auth-form" (ngSubmit)="submitPasswordReset()">
            <div class="reset-summary">
              Code envoyé pour <strong>{{ resetData.identifier }}</strong>
              <button type="button" class="link-button" (click)="setMode('forgot-request')">Modifier</button>
            </div>

            <div class="form-group">
              <label for="resetCode">Code à 6 chiffres</label>
              <input id="resetCode" name="resetCode" class="form-control code-input" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" [(ngModel)]="resetData.code" placeholder="000000" />
            </div>

            <div class="form-group">
              <label for="newPassword">Nouveau mot de passe</label>
              <div class="input-wrapper">
                <input id="newPassword" name="newPassword" class="form-control password-control" [type]="showResetPassword() ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="resetData.newPassword" placeholder="Nouveau mot de passe" />
                <button type="button" class="password-toggle" (click)="showResetPassword.update(value => !value)">{{ showResetPassword() ? 'Masquer' : 'Afficher' }}</button>
              </div>
            </div>

            <div class="form-group">
              <label for="confirmResetPassword">Confirmer le nouveau mot de passe</label>
              <input id="confirmResetPassword" name="confirmResetPassword" class="form-control" [type]="showResetPassword() ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="resetData.confirmPassword" placeholder="Confirmez le mot de passe" />
            </div>

            <button class="submit-btn" type="submit" [disabled]="loading()">
              {{ loading() ? 'Réinitialisation…' : 'Réinitialiser le mot de passe' }}
            </button>

            <div class="secondary-links">
              <button type="button" class="link-button" [disabled]="loading()" (click)="requestResetCode()">Renvoyer le code</button>
              <span>•</span>
              <button type="button" class="link-button" (click)="setMode('login')">Annuler</button>
            </div>
          </form>
        }
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .auth-wrapper {
      min-height: 100vh;
      display: grid;
      place-items: center;
      position: relative;
      overflow: hidden;
      padding: 32px 16px;
      background: linear-gradient(145deg, #eef4fb 0%, #f8fafc 55%, #e5eef9 100%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .bg-shape { position: absolute; border-radius: 999px; pointer-events: none; }
    .bg-shape-1 { width: 420px; height: 420px; left: -100px; top: -100px; background: radial-gradient(circle, rgba(37,99,235,.16), transparent 68%); }
    .bg-shape-2 { width: 310px; height: 310px; right: 7%; top: 12%; border: 1px solid rgba(27,63,117,.18); border-radius: 35% 65% 61% 39% / 42% 38% 62% 58%; transform: rotate(22deg); }
    .bg-shape-3 { width: 540px; height: 540px; right: -180px; bottom: -210px; background: radial-gradient(circle, rgba(147,197,253,.3), transparent 70%); }
    .auth-card {
      position: relative;
      z-index: 1;
      width: min(100%, 470px);
      padding: 36px;
      border-radius: 24px;
      background: rgba(255,255,255,.97);
      border: 1px solid rgba(148,163,184,.24);
      box-shadow: 0 28px 70px rgba(30,58,138,.14);
    }
    .logo-area { display: flex; justify-content: center; margin-bottom: 16px; }
    .auth-logo { width: 180px; max-height: 110px; object-fit: contain; }
    .card-header { text-align: center; margin-bottom: 24px; }
    .card-header h1 { margin: 0; color: #0f172a; font-size: 1.7rem; }
    .card-header p { margin: 8px 0 0; color: #64748b; line-height: 1.5; }
    .auth-form { display: grid; gap: 16px; }
    .form-group { display: grid; gap: 7px; }
    label { color: #334155; font-size: .9rem; font-weight: 700; }
    .input-wrapper { position: relative; display: flex; align-items: center; }
    .form-control {
      width: 100%;
      min-height: 48px;
      padding: 11px 14px 11px 42px;
      border-radius: 12px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #0f172a;
      font: inherit;
      outline: none;
      transition: .18s ease;
      box-sizing: border-box;
    }
    .form-control:not(.password-control):not(.code-input) { }
    .form-control:focus { background: #fff; border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37,99,235,.10); }
    .form-control.has-error { border-color: #dc2626; background: #fff7f7; }
    .password-control { padding-right: 48px; }
    .code-input { padding-left: 14px; text-align: center; letter-spacing: .55em; font-weight: 800; font-size: 1.15rem; }
    .password-toggle { position: absolute; right: 10px; border: 0; background: transparent; cursor: pointer; width: 34px; height: 34px; border-radius: 8px; }
    .password-toggle { font-size: .78rem; font-weight: 800; color: #315b91; border-radius: 9px; }
    .password-toggle:hover { background: #eaf2ff; }
    .form-options { display: flex; justify-content: flex-end; margin-top: -4px; }
    .submit-btn {
      min-height: 48px;
      border: 0;
      border-radius: 999px;
      cursor: pointer;
      background: #93c5fd;
      color: #1e3a8a;
      font-weight: 800;
      font-size: .98rem;
      box-shadow: 0 8px 18px rgba(37,99,235,.18);
    }
    .submit-btn:hover:not(:disabled) { background: #7eb6fc; transform: translateY(-1px); }
    .submit-btn:disabled { opacity: .65; cursor: wait; }
    .link-button { border: 0; padding: 0; background: transparent; color: #315b91; cursor: pointer; font: inherit; font-size: .9rem; }
    .link-button:hover { text-decoration: underline; }
    .link-button.strong { color: #2563eb; font-weight: 800; }
    .auth-switch, .secondary-links { margin: 0; text-align: center; color: #64748b; font-size: .9rem; }
    .secondary-links { display: flex; justify-content: center; gap: 10px; align-items: center; }
    .back-button { border: 0; background: transparent; color: #475569; cursor: pointer; font-weight: 700; }
    .password-help { color: #64748b; font-size: .78rem; line-height: 1.45; }
    .error-text { color: #b91c1c; font-size: .8rem; font-weight: 600; }
    .alert { padding: 12px 14px; border-radius: 12px; margin-bottom: 16px; font-size: .88rem; line-height: 1.45; }
    .alert-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    .alert-success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
    .reset-summary { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 11px 12px; border-radius: 12px; background: #eff6ff; color: #334155; font-size: .86rem; }
    @media (max-width: 520px) { .auth-card { padding: 26px 20px; border-radius: 18px; } .auth-logo { width: 150px; } }
  `]
})
export class LoginComponent {
  mode = signal<AuthMode>('signup');
  showPassword = signal(false);
  showResetPassword = signal(false);
  loading = signal(false);
  errorMsg = signal('');
  successMsg = signal('');

  loginData = { username: '', password: '' };
  signupData = { username: '', email: '', password: '', role: 'USER' };
  confirmPasswordValue = '';
  resetData = { identifier: '', code: '', newPassword: '', confirmPassword: '' };
  validationErrors: { username?: string; email?: string; password?: string; confirmPassword?: string } = {};

  constructor(private apiService: ApiService, private router: Router) {}

  setMode(mode: AuthMode): void {
    this.mode.set(mode);
    this.clearErrors();
    this.successMsg.set('');
  }

  togglePassword(): void {
    this.showPassword.update(value => !value);
  }

  clearErrors(): void {
    this.errorMsg.set('');
    this.validationErrors = {};
  }

  openForgotPassword(): void {
    this.resetData.identifier = this.loginData.username || this.signupData.email || this.signupData.username || '';
    this.resetData.code = '';
    this.resetData.newPassword = '';
    this.resetData.confirmPassword = '';
    this.setMode('forgot-request');
  }

  onLogin(): void {
    this.clearErrors();
    const identifier = this.loginData.username.trim();
    if (!identifier) this.validationErrors.username = "L'identifiant ou l'adresse email est requis.";
    if (!this.loginData.password) this.validationErrors.password = 'Le mot de passe est requis.';
    if (Object.keys(this.validationErrors).length) {
      this.errorMsg.set('Veuillez corriger les champs indiqués.');
      return;
    }

    this.loading.set(true);
    this.apiService.login({ username: identifier, password: this.loginData.password }).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 0) this.errorMsg.set("Le backend Spring Boot n'est pas joignable sur le port 8081.");
        else if (err.status === 401) this.errorMsg.set('Identifiant, email ou mot de passe incorrect.');
        else this.errorMsg.set(err?.error?.message || `Erreur de connexion (${err.status}).`);
      }
    });
  }

  onSignup(): void {
    this.clearErrors();
    const username = this.signupData.username.trim();
    const email = this.signupData.email.trim();
    const password = this.signupData.password;

    if (username.length < 3) this.validationErrors.username = 'Le nom doit contenir au moins 3 caractères.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) this.validationErrors.email = 'Saisissez une adresse email valide.';
    if (!this.isStrongPassword(password)) this.validationErrors.password = 'Le mot de passe ne respecte pas les règles de sécurité.';
    if (password !== this.confirmPasswordValue) this.validationErrors.confirmPassword = 'Les mots de passe ne correspondent pas.';
    if (Object.keys(this.validationErrors).length) {
      this.errorMsg.set('Veuillez corriger les champs indiqués.');
      return;
    }

    this.loading.set(true);
    this.apiService.signup({ username, email, password, role: 'USER' }).subscribe({
      next: () => {
        this.loading.set(false);
        this.loginData.username = email;
        this.loginData.password = '';
        this.signupData = { username: '', email: '', password: '', role: 'USER' };
        this.confirmPasswordValue = '';
        this.mode.set('login');
        this.successMsg.set('Compte créé. Connectez-vous avec votre nom ou votre adresse email.');
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.message || "Impossible de créer le compte.");
      }
    });
  }

  requestResetCode(): void {
    this.clearErrors();
    const identifier = this.resetData.identifier.trim();
    if (!identifier) {
      this.errorMsg.set("Saisissez votre identifiant ou votre adresse email.");
      return;
    }

    this.loading.set(true);
    this.apiService.requestPasswordReset(identifier).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.mode.set('forgot-reset');
        this.successMsg.set(response.message || 'Le code a été envoyé.');
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 0) this.errorMsg.set("Le backend Spring Boot n'est pas joignable.");
        else this.errorMsg.set(err?.error?.message || "Impossible d'envoyer le code. Vérifiez la configuration Gmail du backend.");
      }
    });
  }

  submitPasswordReset(): void {
    this.clearErrors();
    const identifier = this.resetData.identifier.trim();
    const code = this.resetData.code.trim();
    const newPassword = this.resetData.newPassword;

    if (!/^\d{6}$/.test(code)) {
      this.errorMsg.set('Le code doit contenir exactement 6 chiffres.');
      return;
    }
    if (!this.isStrongPassword(newPassword)) {
      this.errorMsg.set('Le nouveau mot de passe doit contenir 8 caractères minimum, une majuscule, une minuscule, un chiffre et un caractère spécial.');
      return;
    }
    if (newPassword !== this.resetData.confirmPassword) {
      this.errorMsg.set('La confirmation du mot de passe ne correspond pas.');
      return;
    }

    this.loading.set(true);
    this.apiService.resetPassword({ identifier, code, newPassword }).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.loginData.username = identifier;
        this.loginData.password = '';
        this.resetData = { identifier: '', code: '', newPassword: '', confirmPassword: '' };
        this.mode.set('login');
        this.successMsg.set(response.message || 'Mot de passe réinitialisé. Vous pouvez vous connecter.');
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err?.error?.message || 'Code invalide ou expiré.');
      }
    });
  }

  private isStrongPassword(password: string): boolean {
    return password.length >= 8
      && /[A-Z]/.test(password)
      && /[a-z]/.test(password)
      && /\d/.test(password)
      && /[@$!%*?&]/.test(password);
  }
}
