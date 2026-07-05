import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-wrapper">
      
      <!-- Abstract Background Elements -->
      <div class="bg-shape bg-shape-1"></div>
      <div class="bg-shape bg-shape-2"></div>
      <div class="bg-shape bg-shape-3"></div>

      <div class="auth-card panel">
        
        <div class="logo-area">
          <img src="assets/logo.png" alt="TELNET Logo" class="auth-logo">
        </div>

        <div class="card-header" style="text-align: center;">
          @if (isLoginMode()) {
            <h1 class="auth-card-title">Se connecter</h1>
            <p class="card-subtitle">Accédez à votre espace sécurisé en quelques instants</p>
          } @else {
            <h1 class="auth-card-title">S'inscrire</h1>
            <p class="card-subtitle">Rejoignez notre plateforme technologique en quelques étapes</p>
          }
        </div>

        @if (errorMsg()) {
          <div class="alert alert-danger">
            <span>{{ errorMsg() }}</span>
          </div>
        }
        @if (successMsg()) {
          <div class="alert alert-success">
            <span>{{ successMsg() }}</span>
          </div>
        }

        <!-- LOGIN FORM -->
        @if (isLoginMode()) {
          <form (ngSubmit)="onLogin()" class="auth-form">
            <div class="form-group">
              <label for="username">Identifiant ou Adresse e-mail</label>
              <div class="input-wrapper">
                <svg class="input-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <input 
                  type="text" 
                  id="username" 
                  name="username" 
                  class="form-control" 
                  [class.has-error]="validationErrors.username"
                  [(ngModel)]="loginData.username" 
                  placeholder="Jean Dupont"
                  (input)="clearErrors()"
                />
              </div>
              @if (validationErrors.username) {
                <div class="error-text">{{ validationErrors.username }}</div>
              }
            </div>
            
            <div class="form-group">
              <label for="password">Mot de passe</label>
              <div class="input-wrapper">
                <svg class="input-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <input 
                  [type]="showPassword() ? 'text' : 'password'" 
                  id="password" 
                  name="password" 
                  class="form-control" 
                  [class.has-error]="validationErrors.password"
                  [(ngModel)]="loginData.password" 
                  placeholder="Mot de passe"
                  (input)="clearErrors()"
                />
                <button type="button" class="btn-toggle-pwd" (click)="togglePassword()">
                  @if (showPassword()) {
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  } @else {
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  }
                </button>
              </div>
              @if (validationErrors.password) {
                <div class="error-text">{{ validationErrors.password }}</div>
              }
            </div>
            
            <div class="form-group options-row">
              <div></div> <!-- empty div to push the link to the right -->
              <a href="#" class="forgot-link" (click)="forgotPassword($event)">Mot de passe oublié ?</a>
            </div>

            <button type="submit" class="btn btn-primary w-100 submit-btn" [disabled]="loading()">
              @if (loading()) {
                <span class="spinner"></span> Connexion en cours...
              } @else {
                Se connecter
              }
            </button>
            
            <div class="auth-switch">
              Vous n'avez pas de compte ? <a href="#" (click)="setMode(false, $event)">S'inscrire</a>
            </div>
          </form>
        } @else {
        <!-- SIGNUP FORM -->
          <form (ngSubmit)="onSignup()" class="auth-form">
            
            <div class="form-group">
              <label for="regUsername">Nom complet (Identifiant)</label>
              <div class="input-wrapper">
                <svg class="input-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <input 
                  type="text" 
                  id="regUsername" 
                  name="regUsername" 
                  class="form-control"
                  [class.has-error]="validationErrors.username"
                  [(ngModel)]="signupData.username" 
                  placeholder="Jean Dupont"
                  (input)="clearErrors()"
                />
              </div>
              @if (validationErrors.username) {
                <div class="error-text">{{ validationErrors.username }}</div>
              }
            </div>
            
            <div class="form-group">
              <label for="regEmail">Adresse e-mail</label>
              <div class="input-wrapper">
                <svg class="input-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                <input 
                  type="email" 
                  id="regEmail" 
                  name="regEmail" 
                  class="form-control"
                  [class.has-error]="validationErrors.email"
                  [(ngModel)]="signupData.email" 
                  placeholder="jean.dupont@email.com"
                  (input)="clearErrors()"
                />
              </div>
              @if (validationErrors.email) {
                <div class="error-text">{{ validationErrors.email }}</div>
              }
            </div>
            
            <div class="form-group">
              <label for="regPassword">Mot de passe</label>
              <div class="input-wrapper">
                <svg class="input-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <input 
                  [type]="showPassword() ? 'text' : 'password'" 
                  id="regPassword" 
                  name="regPassword" 
                  class="form-control"
                  [class.has-error]="validationErrors.password"
                  [(ngModel)]="signupData.password" 
                  placeholder="Mot de passe"
                  (input)="clearErrors()"
                />
                <button type="button" class="btn-toggle-pwd" (click)="togglePassword()">
                  @if (showPassword()) {
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  } @else {
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  }
                </button>
              </div>
              @if (validationErrors.password) {
                <div class="error-text">{{ validationErrors.password }}</div>
              }
            </div>

            <div class="form-group" style="margin-bottom: 2rem;">
              <label for="confirmPassword">Confirmer le mot de passe</label>
              <div class="input-wrapper">
                <svg class="input-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <input 
                  [type]="showPassword() ? 'text' : 'password'" 
                  id="confirmPassword" 
                  name="confirmPassword" 
                  class="form-control"
                  [class.has-error]="validationErrors.confirmPassword"
                  [(ngModel)]="confirmPasswordValue" 
                  placeholder="Confirmer le mot de passe"
                  (input)="clearErrors()"
                />
              </div>
              @if (validationErrors.confirmPassword) {
                <div class="error-text">{{ validationErrors.confirmPassword }}</div>
              }
            </div>
            
            <button type="submit" class="btn btn-primary w-100 submit-btn" [disabled]="loading()">
              @if (loading()) {
                <span class="spinner"></span> S'inscrire...
              } @else {
                S'inscrire
              }
            </button>

            <div class="auth-switch">
              Vous avez déjà un compte ? <a href="#" (click)="setMode(true, $event)">Se connecter</a>
            </div>
          </form>
        }
      </div>
      
      <!-- Footer Contact Info -->
      <div class="auth-footer">
        <p>Pour toute assistance, contactez-nous :</p>
        <p><strong>Service Clientèle : +216 31 380 840 | Email de Contact : info&#64;groupe-telnet.net</strong></p>
      </div>
    </div>
  `,
  styles: [`
    .auth-wrapper {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: #f1f4f9;
      position: relative;
      overflow: hidden;
      padding: 2rem;
    }

    /* Abstract Background Graphics */
    .bg-shape {
      position: absolute;
      z-index: 0;
      border-radius: 50%;
    }
    .bg-shape-1 {
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(162,190,230,0.4) 0%, rgba(241,244,249,0) 70%);
      top: 10%;
      left: 10%;
    }
    .bg-shape-2 {
      width: 300px;
      height: 300px;
      border: 1px solid rgba(162,190,230,0.5);
      top: 25%;
      left: 15%;
      border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
      transform: rotate(45deg);
    }
    .bg-shape-3 {
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(241,244,249,0) 70%);
      bottom: -10%;
      right: -10%;
    }

    .auth-card {
      position: relative;
      z-index: 10;
      width: 100%;
      max-width: 460px;
      padding: 3rem;
      background: #FFFFFF;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.06);
    }

    .logo-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 2rem;
    }

    .auth-logo {
      height: 190px;
      width: auto;
      max-width: 100%;
      object-fit: contain;
    }

    .logo-text {
      font-size: 2.5rem;
      font-weight: 800;
      color: #1b3f75;
      letter-spacing: -1px;
    }

    .logo-text span {
      color: #2563eb;
    }

    .card-header {
      margin-bottom: 2rem;
    }

    .auth-card-title {
      font-size: 1.6rem;
      font-weight: 700;
      color: #000000 !important;
      text-transform: none !important;
      letter-spacing: 0;
      margin: 0;
    }

    .card-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #64748b;
      text-transform: none;
      margin: 0;
    }

    .card-subtitle {
      color: #64748b;
      margin-top: 0.5rem;
      font-size: 0.95rem;
    }

    /* Input with embedded icons */
    .form-group {
      margin-bottom: 1.25rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      font-size: 0.9rem;
      color: #334155;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-icon {
      position: absolute;
      left: 14px;
      color: #6b7280;
    }

    .form-control {
      width: 100%;
      padding: 0.75rem 1rem 0.75rem 2.8rem;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 1rem;
      transition: all 0.2s;
    }

    .form-control:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .form-control.has-error {
      border-color: #ef4444;
      background-color: #fef2f2;
    }

    .btn-toggle-pwd {
      position: absolute;
      right: 14px;
      background: none;
      border: none;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
    }

    .btn-toggle-pwd:hover {
      color: #1b3f75;
    }

    /* Checkbox & Options */
    .options-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 500;
      color: #4b5563;
      font-size: 0.9rem;
      margin: 0;
    }

    .forgot-link {
      font-size: 0.9rem;
      color: #4b5563;
      text-decoration: none;
    }
    .forgot-link:hover {
      color: #1b3f75;
      text-decoration: underline;
    }

    /* Primary Button */
    .submit-btn {
      background: #93c5fd;
      color: #64748b;
      padding: 0.85rem;
      font-size: 1rem;
      font-weight: 500;
      text-transform: none;
      border: none;
      border-radius: 50px;
      width: 100%;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 1.5rem;
      box-shadow: 0 4px 10px rgba(147, 197, 253, 0.35);
    }

    .submit-btn:hover:not(:disabled) {
      background: #7eb6fc;
      color: #64748b;
      transform: translateY(-1px);
    }

    .submit-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    /* Text & Links */
    .terms-text {
      text-align: center;
      font-size: 0.75rem;
      color: #6b7280;
      margin-bottom: 1.5rem;
    }
    .terms-text a {
      color: #6b7280;
      text-decoration: underline;
    }
    .terms-text a:hover {
      color: #1b3f75;
    }

    .auth-switch {
      text-align: center;
      font-size: 0.9rem;
      color: #4b5563;
    }
    .auth-switch a {
      color: #93c5fd;
      font-weight: 700;
      text-decoration: none;
    }
    .auth-switch a:hover {
      text-decoration: underline;
    }

    .error-text {
      color: #ef4444;
      font-size: 0.8rem;
      margin-top: 0.4rem;
      font-weight: 500;
    }

    .alert {
      padding: 1rem;
      border-radius: 6px;
      margin-bottom: 1.5rem;
      font-weight: 500;
      font-size: 0.9rem;
    }
    .alert-danger { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .alert-success { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }

    /* Footer outside card */
    .auth-footer {
      position: relative;
      z-index: 10;
      margin-top: 2rem;
      text-align: center;
      font-size: 0.85rem;
      color: #374151;
    }
    .auth-footer p {
      margin: 0.25rem 0;
    }

    .spinner {
      display: inline-block;
      width: 1rem;
      height: 1rem;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 1s ease-in-out infinite;
      margin-right: 0.5rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class LoginComponent {
  isLoginMode = signal(false); // Show signup by default based on the user screenshot
  showPassword = signal(false);
  
  loginData = { username: '', password: '' };
  signupData = { username: '', email: '', password: '', role: 'USER' };
  confirmPasswordValue = '';
  rememberMe = false;

  loading = signal(false);
  errorMsg = signal('');
  successMsg = signal('');
  
  validationErrors: any = {};

  constructor(private apiService: ApiService, private router: Router) {}

  setMode(isLogin: boolean, event?: Event): void {
    if (event) event.preventDefault();
    this.isLoginMode.set(isLogin);
    this.clearErrors();
    this.successMsg.set('');
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  clearErrors() {
    this.errorMsg.set('');
    this.validationErrors = {};
  }

  forgotPassword(event: Event) {
    event.preventDefault();
    this.successMsg.set("Un lien de réinitialisation vous a été envoyé si cet utilisateur existe.");
    this.errorMsg.set('');
  }

  onLogin(): void {
    this.clearErrors();
    let hasError = false;

    if (!this.loginData.username || this.loginData.username.trim() === '') {
      this.validationErrors.username = "L'identifiant est requis.";
      hasError = true;
    }
    
    if (!this.loginData.password) {
      this.validationErrors.password = "Le mot de passe est requis.";
      hasError = true;
    }

    if (hasError) {
      this.errorMsg.set('Veuillez corriger les erreurs dans le formulaire.');
      return;
    }

    this.loading.set(true);

    this.apiService.login(this.loginData).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 0) {
          this.errorMsg.set("Serveur injoignable (Failed to fetch). Le backend Spring Boot n'est pas démarré.");
        } else if (err.status === 401) {
          this.errorMsg.set("Identifiants incorrects. Veuillez vérifier votre identifiant et mot de passe.");
        } else if (err.status === 404) {
          this.errorMsg.set("Cet utilisateur n'existe pas dans le système.");
        } else {
          this.errorMsg.set(`Erreur serveur (${err.status}): ${err.message}`);
        }
      }
    });
  }

  onSignup(): void {
    this.clearErrors();
    let hasError = false;

    if (!this.signupData.username || this.signupData.username.length < 3) {
      this.validationErrors.username = "Le nom complet est requis (min 3 caractères).";
      hasError = true;
    }
    if (!this.signupData.email || !this.signupData.email.includes('@')) {
      this.validationErrors.email = "Une adresse e-mail valide est requise.";
      hasError = true;
    }
    if (!this.signupData.password || this.signupData.password.length < 8) {
      this.validationErrors.password = "Le mot de passe doit faire au moins 8 caractères.";
      hasError = true;
    }
    if (this.signupData.password !== this.confirmPasswordValue) {
      this.validationErrors.confirmPassword = "Les mots de passe ne correspondent pas.";
      hasError = true;
    }

    if (hasError) {
      this.errorMsg.set('Veuillez corriger les erreurs de saisie ci-dessus.');
      return;
    }

    this.loading.set(true);

    // By default all new users are "USER" in this design (no role selector visible)
    this.signupData.role = 'USER';

    this.apiService.signup(this.signupData).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.successMsg.set('Inscription réussie ! Vous pouvez vous connecter.');
        this.loginData.username = this.signupData.username;
        this.signupData = { username: '', email: '', password: '', role: 'USER' };
        this.confirmPasswordValue = '';
        setTimeout(() => this.setMode(true), 2000);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 0) {
          this.errorMsg.set("Serveur injoignable (Failed to fetch). Le backend n'est pas démarré.");
        } else if (err.error && err.error.message) {
          this.errorMsg.set(`Erreur de création: ${err.error.message}`);
        } else {
          this.errorMsg.set("Une erreur inconnue s'est produite lors de l'inscription.");
        }
      }
    });
  }
}
