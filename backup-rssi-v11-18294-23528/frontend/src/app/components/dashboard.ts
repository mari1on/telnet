import { Component, OnInit, signal, computed, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, User } from '../api.service';

interface Evenement {
  id?: number;
  descriptionDetaillee: string;
  dateHeureDetection: string;
  detecteParSource: string;
  idTicket: string;
  commentaireSource: string;
  natureEvenement: string;
  serviceOsAppli: string;
  equipementHardware: string;
  libelleErreur: string;
  codeErreur: string;
  causesPossibles: string;
  etat: string;
  appreciation: string;
  evaluation: string;
  impact: string;
  impactNiveau: string;
  impactMineur: boolean;
  impactCommentaire: string;
  typeActif: string;
  actifAffecte: string;
  qualification?: string;
  qualifiePar?: string;
  declarePar?: string;
  impactConfidentialite?: string;
  commentaireConfidentialite?: string;
  impactIntegrite?: string;
  commentaireIntegrite?: string;
  impactDisponibilite?: string;
  commentaireDisponibilite?: string;
  envoyeAuRssi?: boolean;
  dateEnvoiRssi?: string;
}

interface Risque {
  id?: number;
 reference?: string;
description?: string;
}

interface Incident {
  id?: number;
  typesIncident: string[];
  niveauImpact: string;
  dureeIndisponibilite: string;
  mesureActionNumero: string;
  mesureAction: string;
  mesureResponsable: string;
  mesureDelai: string;
  mesureEtat: string;
  mesureDDT: string;
  mesureDateCloture: string;
  mesureHeureCloture: string;
  dureeAttenuation: string;
  heureAttenuation: string;
  traitementAction: string;
  traitementDDT: string;
  traitementHDT: string;
  traitementResponsable: string;
  traitementEtat: string;
  traitementDateCloture: string;
  traitementHeureCloture: string;
  dureeTraitement: string;
  heureTraitement: string;
  preconisation: string;
  actionCorrective: string;
  correctiveResponsable: string;
  correctiveDateDebut: string;
  correctiveDateCloture: string;
  dateMesureEfficacite: string;
  efficacite: string;
  commentaireEfficacite: string;
  hasRisquesAssocies: boolean;
  impactContinuite: boolean;
  impactContinuiteDescription: string;
  capitalisation: boolean;
  evenementsSimilaires: string;
  evenementsDetailsDescription: string;
  changementDeclenche: boolean;
  changementDeclencheDescription: string;
  miseAJourPcaNecessaire: boolean;
  referencePca: string;
  risques: Risque[];
  risquesAMettreAJour: boolean;
  risquesMiseAJour: string;
  risquesMiseAJourDescription: string;
  suiviEdition: string;
  suiviDate: string;
  suiviAuteur: string;
  suiviCommentaires: string;
  evenement: Partial<Evenement> & { id: number };
}


interface AssistantMatch {
  eventId: number;
  title: string;
  date?: string;
  score: number;
  qualification?: string;
  reason?: string;
}

interface AssistantIncidentDraft {
  typesIncident?: string[];
  niveauImpact?: string;
  dureeIndisponibilite?: string;
  mesureAction?: string;
  mesureEtat?: string;
  traitementAction?: string;
  traitementEtat?: string;
  preconisation?: string;
  actionCorrective?: string;
  impactContinuite?: boolean;
  impactContinuiteDescription?: string;
  changementDeclenche?: boolean;
  changementDeclencheDescription?: string;
  risques?: Risque[];
}

interface AssistantResponse {
  answer: string;
  confirmationPrompt: string;
  askToFillIncident?: boolean;
  selectedEventId?: number | null;
  incidentDraft?: AssistantIncidentDraft;
  similarFound: boolean;
  matches: AssistantMatch[];
  actions: string[];
  source: string;
  engine?: string;
  diagnostic?: string;
}

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  activeTab = signal<'stats' | 'events' | 'incidents' | 'logs' | 'assistant' | 'settings'>('stats');
  darkMode = signal(true);
  sidebarOpen = signal(false);
  productUpdates = signal(false);

  // Recherche et filtres des listes
  eventSearch = '';
  eventStateFilter = 'ALL';
  eventQualificationFilter = 'ALL';
  eventRssiFilter = 'ALL';
  incidentSearch = '';
  incidentStateFilter = 'ALL';
  logSearch = '';
  selectedExistingRiskReference = '';
  activeVoiceSearch = signal<string | null>(null);
  assistantAutoSpeak = signal(true);

  // Assistant RSSI local (moteur Python, sans service d'IA externe)
  assistantSelectedEventId: number | null = null;
  assistantInferredEventId: number | null = null;
  aiGeneratingField = signal<string | null>(null);
  assistantAutofillActive = signal(false);
  assistantQuestion = '';
  assistantLoading = signal(false);
  assistantResult = signal<AssistantResponse | null>(null);
  assistantMessages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Posez une question sur TELNET ou décrivez un événement par son titre, son ticket, son code erreur ou son contexte.'
    }
  ]);

  // Lists
  events = signal<Evenement[]>([]);
  incidents = signal<Incident[]>([]);
  risks = signal<Risque[]>([]);
  logs = signal<any[]>([]);

  isSubmitting = signal<boolean>(false);
  isSendingToRssi = signal<boolean>(false);

  // Selected Items for Forms/Modals
  selectedEvent = signal<Evenement | null>(null);
  selectedIncident = signal<Incident | null>(null);

  // Forms Visibility
  showEventForm = signal(false);
  showIncidentForm = signal(false);
  showQualifyForm = signal(false);
  showUserModal = signal(false);

  // Error/Success messages
  successMsg = signal('');
  errorMsg = signal('');

  // Dropdown list options
  sources = ['HELP_DESK', 'SIEM', 'UTILISATEUR', 'SUPERVISION', 'AUTRE'];
  eventNatures = ['Indisponibilite', 'Degradation', 'Erreur applicative', 'Alerte securite', 'Suspicion de fraude', 'Autre'];
  etatsEvent = ['Ouvert', 'En cours', 'Clos'];
  eventImpactLevels = ['Aucun', 'Mineur', 'Majeur', 'Critique'];
  impactOptions = ['Aucun', 'Mineur', 'Majeur', 'Critique'];
  etatsMesure = ['En cours', 'Terminé', 'En attente'];
  etatsTraitement = ['En cours', 'Clôturé', 'Suspendu'];
  yesNoOptions = [
    { label: 'Non', value: false },
    { label: 'Oui', value: true }
  ];
  incidentImpactLevels = [
    {
      value: 'NIVEAU_1',
      label: 'Niveau 1',
      description: 'Pas d impact sur la continuite de l activite ou du service'
    },
    {
      value: 'NIVEAU_2',
      label: 'Niveau 2',
      description: 'Impact mineur sur la CID d une activite ou d un service'
    },
    {
      value: 'NIVEAU_3',
      label: 'Niveau 3',
      description: 'Impact majeur sur la CID d une activite ou d un service'
    },
    {
      value: 'NIVEAU_4',
      label: 'Niveau 4',
      description: 'Impact definitif sur l entreprise'
    }
  ];
  incidentTypesList = [
    'Défaillance technique',
    'Dommage physique',
    'Accès non autorisé',
    'Déni de service (DoS/DDoS)',
    'Fuite de données',
    'Malware / Virus',
    'Autre'
  ];

  // Event Form Model
  eventForm: Evenement = this.initEventForm();

  // Incident Form Model
  incidentForm: Incident = this.initIncidentForm(0);

  // Qualification Model
  qualifyValue = 'INCIDENT'; // 'INCIDENT' or 'NON_INCIDENT'
  userForm = {
    username: '',
    email: '',
    role: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  constructor(protected apiService: ApiService, private cdr: ChangeDetectorRef, private router: Router) {}

  ngOnInit(): void {
    this.activeTab.set(this.apiService.isRssi() ? 'stats' : 'events');
    this.productUpdates.set(localStorage.getItem('telnet_product_updates') === 'true');
    this.loadEvents();
    this.loadIncidents();
    this.loadRisks();
    this.loadLogs();
  }

  // --- Initializers ---
  initEventForm(): Evenement {
    return {
      descriptionDetaillee: '',
      dateHeureDetection: new Date().toISOString().slice(0, 16),
      detecteParSource: 'HELP_DESK',
      idTicket: '',
      commentaireSource: '',
      natureEvenement: 'Indisponibilite',
      serviceOsAppli: '',
      equipementHardware: '',
      libelleErreur: '',
      codeErreur: '',
      causesPossibles: '',
      etat: 'Ouvert',
      appreciation: '',
      evaluation: '',
      impact: '',
      impactNiveau: 'Aucun',
      impactMineur: false,
      impactCommentaire: '',
      typeActif: '',
      actifAffecte: '',
      qualification: 'NON_QUALIFIE',
      impactConfidentialite: 'Aucun',
      commentaireConfidentialite: '',
      impactIntegrite: 'Aucun',
      commentaireIntegrite: '',
      impactDisponibilite: 'Aucun',
      commentaireDisponibilite: ''
    };
    
  }

  initIncidentForm(eventId: number): Incident {
    return {
      typesIncident: [],
      niveauImpact: 'NIVEAU_1',
      dureeIndisponibilite: '',
      mesureActionNumero: '',
      mesureAction: '',
      mesureResponsable: '',
      mesureDelai: '',
      mesureEtat: 'En cours',
      mesureDDT: new Date().toISOString().slice(0, 10),
      mesureDateCloture: '',
      mesureHeureCloture: '',
      dureeAttenuation: '',
      heureAttenuation: new Date().toTimeString().slice(0, 5),
      traitementAction: '',
      traitementDDT: new Date().toISOString().slice(0, 10),
      traitementHDT: new Date().toTimeString().slice(0, 5),
      traitementResponsable: '',
      traitementEtat: 'En cours',
      traitementDateCloture: '',
      traitementHeureCloture: '',
      dureeTraitement: '',
      heureTraitement: '',
      preconisation: '',
      actionCorrective: '',
      correctiveResponsable: '',
      correctiveDateDebut: '',
      correctiveDateCloture: '',
      dateMesureEfficacite: '',
      efficacite: '',
      commentaireEfficacite: '',
      hasRisquesAssocies: false,
      impactContinuite: false,
      impactContinuiteDescription: '',
      capitalisation: false,
      evenementsSimilaires: 'Non',
      evenementsDetailsDescription: '',
      changementDeclenche: false,
      changementDeclencheDescription: '',
      miseAJourPcaNecessaire: false,
      referencePca: '',
      risques: [],
      risquesAMettreAJour: false,
      risquesMiseAJour: '',
      risquesMiseAJourDescription: '',
      suiviEdition: '1',
      suiviDate: new Date().toISOString().slice(0, 10),
      suiviAuteur: '',
      suiviCommentaires: '',
      evenement: { id: eventId }
    };
  }

  toggleTheme(): void {
    this.darkMode.update(value => !value);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(value => !value);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  getEventBarHeight(count: number): number {
    const max = Math.max(...this.getEventsByYear().map(item => item.count), 0);
    return max === 0 ? 0 : Math.max(10, Math.round((count / max) * 100));
  }

  getNatureBarWidth(count: number): number {
    const max = Math.max(...this.getEventsByNature().map(item => item.count), 0);
    return max === 0 ? 0 : Math.max(8, Math.round((count / max) * 100));
  }

  getIncidentDonutGradient(): string {
    const states = this.getIncidentsByEtat();
    const total = states.reduce((sum, item) => sum + item.count, 0);
    if (total === 0) {
      return 'conic-gradient(#3a4351 0 100%)';
    }

    const open = ((states.find(item => item.etat === 'Ouvert')?.count || 0) / total) * 100;
    const inProgress = ((states.find(item => item.etat === 'En cours')?.count || 0) / total) * 100;
    const secondStop = open + inProgress;

    return `conic-gradient(
      #7898cc 0 ${open}%,
      #57709a ${open}% ${secondStop}%,
      #394453 ${secondStop}% 100%
    )`;
  }

  // --- Actions ---
  switchTab(tab: 'events' | 'incidents' | 'logs' | 'stats' | 'assistant' | 'settings'): void {
    this.activeTab.set(tab as any);
    this.successMsg.set('');
    this.errorMsg.set('');
    if (tab === 'events') this.loadEvents();
    if (tab === 'incidents') { this.loadIncidents(); this.loadRisks(); }
    if (tab === 'logs') this.loadLogs();
    if (tab === 'assistant') this.prepareAssistantSelection();
  }

  getNonQualifiedCount(): number {
    return this.events().filter(e => e.qualification === 'NON_QUALIFIE').length;
  }

  getNonQualifiedPercent(): number {
    const total = this.events().length;
    return total === 0 ? 0 : Math.round((this.getNonQualifiedCount() / total) * 100);
  }

  getIncidentCount(): number {
    return this.events().filter(e => e.qualification === 'INCIDENT').length;
  }

  getIncidentPercent(): number {
    const total = this.events().length;
    return total === 0 ? 0 : Math.round((this.getIncidentCount() / total) * 100);
  }

  // --- NOUVEAUX KPIs RSSI ---

  getIncidentsEnCours(): number {
    return this.incidents().filter(i => i.traitementEtat !== 'Clôturé').length;
  }

  getIncidentsTraites(): number {
    return this.incidents().filter(i => i.traitementEtat === 'Clôturé').length;
  }

  getRisquesTouchesCount(): number {
    return this.incidents().reduce((total, i) => total + (i.risques ? i.risques.length : 0), 0);
  }

  getEvenementsClasses(): number {
    return this.events().filter(e => e.qualification && e.qualification !== 'NON_QUALIFIE').length;
  }

  getEvenementsClassesPercent(): number {
    const total = this.events().length;
    return total === 0 ? 0 : Math.round((this.getEvenementsClasses() / total) * 100);
  }

  getIncidentsImpactCritiqueConfidentialite(): number {
    return this.incidents().filter(incident =>
      this.getIncidentEvent(incident)?.impactConfidentialite === 'Critique'
    ).length;
  }

  getIncidentsImpactCritiqueDisponibilite(): number {
    return this.incidents().filter(incident =>
      this.getIncidentEvent(incident)?.impactDisponibilite === 'Critique'
    ).length;
  }

  getIncidentsImpactCritiqueIntegrite(): number {
    return this.incidents().filter(incident =>
      this.getIncidentEvent(incident)?.impactIntegrite === 'Critique'
    ).length;
  }

  getCriticalImpactStats(): Array<{ label: string; count: number; key: string }> {
    return [
      { label: 'Confidentialité', count: this.getIncidentsImpactCritiqueConfidentialite(), key: 'confidentialite' },
      { label: 'Disponibilité', count: this.getIncidentsImpactCritiqueDisponibilite(), key: 'disponibilite' },
      { label: 'Intégrité', count: this.getIncidentsImpactCritiqueIntegrite(), key: 'integrite' }
    ];
  }

  getCriticalImpactBarWidth(count: number): number {
    const max = Math.max(...this.getCriticalImpactStats().map(item => item.count), 1);
    return count === 0 ? 0 : Math.max(12, Math.round((count / max) * 100));
  }

  // Rough estimation of average duration (indisponibilité) in minutes
  getTempsMoyenIndisponibilite(): string {
    const incs = this.incidents().filter(i => i.dureeIndisponibilite);
    if (incs.length === 0) return 'N/A';

    let totalMins = 0;
    incs.forEach(inc => {
      totalMins += this.parseDurationToMinutes(inc.dureeIndisponibilite);
    });

    const avg = Math.round(totalMins / incs.length);
    return this.formatMinutesToDuration(avg);
  }

  getTempsMoyenTraitement(): string {
    const incs = this.incidents().filter(i => i.dureeTraitement);
    if (incs.length === 0) return 'N/A';

    let totalMins = 0;
    incs.forEach(inc => {
      totalMins += this.parseDurationToMinutes(inc.dureeTraitement);
    });

    const avg = Math.round(totalMins / incs.length);
    return this.formatMinutesToDuration(avg);
  }

  private parseDurationToMinutes(durationStr: string): number {
    if (!durationStr) return 0;
    let mins = 0;
    const hMatch = durationStr.match(/(\d+)\s*h/i);
    const mMatch = durationStr.match(/(\d+)\s*m/i);
    if (hMatch) mins += parseInt(hMatch[1], 10) * 60;
    if (mMatch) mins += parseInt(mMatch[1], 10);
    return mins;
  }

  private formatMinutesToDuration(mins: number): string {
    const hours = Math.floor(mins / 60);
    const m = mins % 60;
    return hours > 0 ? `${hours}h ${m}m` : `${m}m`;
  }

  getRisquesList() {
    return this.incidents().flatMap(i =>
      (i.risques || []).map(r => ({
        ref: r.reference,
        desc: r.description,
        incidentId: i.id
      }))
    );
  }

  getExistingRiskCatalog(): Risque[] {
    const byReference = new Map<string, Risque>();
    const candidates = [
      ...this.risks(),
      ...this.incidents().flatMap(incident => incident.risques || [])
    ];

    for (const risk of candidates) {
      const reference = (risk.reference || '').trim();
      if (!reference) continue;
      const key = this.normalizeSearch(reference);
      if (!byReference.has(key)) {
        byReference.set(key, {
          id: risk.id,
          reference,
          description: (risk.description || '').trim()
        });
      }
    }

    return [...byReference.values()].sort((a, b) =>
      (a.reference || '').localeCompare(b.reference || '', 'fr', { numeric: true })
    );
  }

  getRiskOptionLabel(risk: Risque): string {
    const description = (risk.description || 'Sans description').trim();
    const shortDescription = description.length > 72 ? `${description.slice(0, 72)}…` : description;
    return `${risk.reference || 'Sans référence'} — ${shortDescription}`;
  }

  getSelectedExistingRisk(): Risque | null {
    return this.getExistingRiskCatalog().find(
      risk => risk.reference === this.selectedExistingRiskReference
    ) || null;
  }


  addExistingRiskFromCatalog(): void {
    const selected = this.getExistingRiskCatalog().find(
      risk => risk.reference === this.selectedExistingRiskReference
    );
    if (!selected) {
      this.errorMsg.set('Sélectionnez un risque existant dans la liste.');
      return;
    }
    const alreadyAdded = this.incidentForm.risques.some(
      risk => this.normalizeSearch(risk.reference) === this.normalizeSearch(selected.reference)
    );
    if (alreadyAdded) {
      this.errorMsg.set('Ce risque est déjà associé à ce plan d’incident.');
      return;
    }
    this.incidentForm.risques.push({
      reference: selected.reference,
      description: selected.description
    });
    this.selectedExistingRiskReference = '';
    this.errorMsg.set('');
  }

  getEventsByYear() {
    // Group events by YYYY-MM
    const groups: { [key: string]: number } = {};
    this.events().forEach(e => {
      const ym = e.dateHeureDetection ? e.dateHeureDetection.slice(0, 7) : 'Inconnu';
      groups[ym] = (groups[ym] || 0) + 1;
    });
    return Object.keys(groups).sort().map(k => ({ date: k, count: groups[k] }));
  }

  getTempsTraitementChartData() {
    return this.incidents()
      .filter(i => i.dureeTraitement)
      .map(i => {
        const mins = this.parseDurationToMinutes(i.dureeTraitement);
        const pct = Math.min(100, Math.max(5, (mins / 500) * 100));
        return {
          incidentId: i.id,
          minutes: mins,
          label: i.dureeTraitement,
          heightPct: pct
        };
      })
      .slice(-10); // Show last 10 incidents
  }

  getIncidentsByEtat() {
    const groups: { [key: string]: number } = {
      'Ouvert': 0,
      'En cours': 0,
      'Clos': 0
    };
    this.incidents().forEach(i => {
      const etat = i.evenement?.etat || 'Inconnu';
      if (groups[etat] !== undefined) {
        groups[etat]++;
      } else {
        groups[etat] = 1;
      }
    });
    return Object.keys(groups).map(k => ({ etat: k, count: groups[k] }));
  }

  getEventsByNature() {
    const groups: { [key: string]: number } = {};
    this.events().forEach(e => {
      const nature = e.natureEvenement || 'Autre';
      groups[nature] = (groups[nature] || 0) + 1;
    });
    return Object.keys(groups).map(k => ({ nature: k, count: groups[k] }));
  }

  // --------------------------


  getFilteredEvents(): Evenement[] {
    const search = this.normalizeSearch(this.eventSearch);
    return this.events().filter(event => {
      const searchable = this.normalizeSearch([
        event.libelleErreur,
        event.descriptionDetaillee,
        event.detecteParSource,
        event.declarePar,
        event.etat,
        event.qualification,
        event.natureEvenement,
        event.idTicket,
        event.codeErreur,
        event.serviceOsAppli
      ].filter(Boolean).join(' '));

      const matchesSearch = this.matchesNormalizedSearch(searchable, search);
      const matchesState = this.eventStateFilter === 'ALL' || event.etat === this.eventStateFilter;
      const matchesQualification = this.eventQualificationFilter === 'ALL'
        || event.qualification === this.eventQualificationFilter;
      const matchesRssi = this.eventRssiFilter === 'ALL'
        || (this.eventRssiFilter === 'SENT' && event.envoyeAuRssi === true)
        || (this.eventRssiFilter === 'NOT_SENT' && event.envoyeAuRssi !== true);

      return matchesSearch && matchesState && matchesQualification && matchesRssi;
    });
  }

  getFilteredIncidents(): Incident[] {
    const search = this.normalizeSearch(this.incidentSearch);
    return this.incidents().filter(incident => {
      const event = this.getIncidentEvent(incident);
      const searchable = this.normalizeSearch([
        incident.id,
        event?.id,
        event?.libelleErreur,
        event?.descriptionDetaillee,
        event?.natureEvenement,
        incident.traitementEtat,
        incident.traitementResponsable,
        incident.niveauImpact,
        incident.dureeIndisponibilite,
        incident.dureeTraitement
      ].filter(value => value !== undefined && value !== null).join(' '));

      const matchesSearch = this.matchesNormalizedSearch(searchable, search);
      const matchesState = this.incidentStateFilter === 'ALL'
        || incident.traitementEtat === this.incidentStateFilter;
      return matchesSearch && matchesState;
    });
  }

  getIncidentDowntimeDisplay(incident: Incident): string {
    if (this.isFilled(incident.dureeIndisponibilite)) {
      return incident.dureeIndisponibilite;
    }
    const event = this.getIncidentEvent(incident);
    if (!event?.dateHeureDetection) return 'Non calculable';

    const start = new Date(event.dateHeureDetection);
    if (Number.isNaN(start.getTime())) return 'Non calculable';

    const closures = [
      incident.mesureDateCloture && incident.mesureHeureCloture
        ? new Date(`${incident.mesureDateCloture}T${incident.mesureHeureCloture}`)
        : null,
      incident.traitementDateCloture && incident.traitementHeureCloture
        ? new Date(`${incident.traitementDateCloture}T${incident.traitementHeureCloture}`)
        : null
    ].filter((value): value is Date => value !== null && !Number.isNaN(value.getTime()));

    const end = closures.length > 0
      ? closures.reduce((earliest, value) => value.getTime() < earliest.getTime() ? value : earliest)
      : new Date();
    return this.formatDurationBetween(start, end) + (closures.length === 0 ? ' (en cours)' : '');
  }

  getFilteredLogs(): any[] {
    const search = this.normalizeSearch(this.logSearch);
    if (!search) return this.logs();
    return this.logs().filter(log => {
      const timestamp = log.timestamp ? new Date(log.timestamp) : null;
      const dateText = timestamp && !Number.isNaN(timestamp.getTime())
        ? `${timestamp.toLocaleDateString('fr-FR')} ${timestamp.toLocaleTimeString('fr-FR')}`
        : '';
      const searchable = this.normalizeSearch([
        log.username,
        log.action,
        log.timestamp,
        dateText
      ].filter(Boolean).join(' '));
      return this.matchesNormalizedSearch(searchable, search);
    });
  }

  resetEventFilters(): void {
    this.eventSearch = '';
    this.eventStateFilter = 'ALL';
    this.eventQualificationFilter = 'ALL';
    this.eventRssiFilter = 'ALL';
  }

  resetIncidentFilters(): void {
    this.incidentSearch = '';
    this.incidentStateFilter = 'ALL';
  }

  resetLogFilters(): void {
    this.logSearch = '';
  }

  private matchesNormalizedSearch(searchable: string, normalizedQuery: string): boolean {
    if (!normalizedQuery) return true;
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return terms.every(term => searchable.includes(term));
  }

  private normalizeSearch(value: unknown): string {
    const synonyms: Record<string, string> = {
      authentication: 'authentification', login: 'authentification', access: 'acces',
      network: 'reseau', connectivity: 'reseau', firewall: 'parefeu',
      outage: 'indisponibilite', downtime: 'indisponibilite', down: 'indisponibilite',
      server: 'serveur', host: 'serveur',
      event: 'evenement', events: 'evenements', declaration: 'declaration',
      risk: 'risque', risks: 'risques', threat: 'menace',
      open: 'ouvert', closed: 'clos', pending: 'attente',
      major: 'majeur', minor: 'mineur', critical: 'critique',
      integrity: 'integrite', availability: 'disponibilite', confidentiality: 'confidentialite',
      sent: 'envoye', user: 'utilisateur', helpdesk: 'help desk'
    };

    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(token => synonyms[token] || token)
      .join(' ');
  }

  getIncidentEvent(incident: Incident): Evenement | undefined {
    const embedded = incident.evenement as Partial<Evenement> | undefined;
    if (embedded?.id && (embedded.libelleErreur || embedded.descriptionDetaillee || embedded.natureEvenement || embedded.dateHeureDetection)) {
      return embedded as Evenement;
    }
    return this.events().find(event => event.id === embedded?.id);
  }

  getImpactLevelDescription(value?: string): string {
    return this.incidentImpactLevels.find(level => level.value === value)?.description || '';
  }

  private isFilled(value?: string | null): boolean {
    return (value || '').trim().length > 0;
  }

  validateEventFormComplete(event: Evenement): string | null {
    if (!this.isFilled(event.libelleErreur)) return 'Le libellé d\'erreur (titre) est obligatoire.';
    if (!this.isFilled(event.descriptionDetaillee)) return 'La description détaillée est obligatoire.';
    if (!this.isFilled(event.dateHeureDetection)) return 'La date et l\'heure de détection sont obligatoires.';
    if (!this.isFilled(event.declarePar)) return 'Le champ « Détecté par » est obligatoire.';
    if (!this.isFilled(event.detecteParSource)) return 'La source de détection est obligatoire.';
    if (!this.isFilled(event.idTicket)) return "L'ID Ticket est obligatoire et doit être unique.";
    if (!this.isFilled(event.codeErreur)) return 'Le code erreur est obligatoire et doit être unique.';
    if (!this.isFilled(event.causesPossibles)) return 'Les causes possibles sont obligatoires.';
    if (!this.isFilled(event.etat)) return 'L\'état de l\'événement est obligatoire.';
    if (!this.isFilled(event.natureEvenement)) return 'La nature de l\'événement est obligatoire.';
    return null;
  }

  isEventFormComplete(event: Evenement = this.eventForm): boolean {
    return this.validateEventFormComplete(event) === null;
  }

  canSendEventToRssi(event?: Evenement | null): boolean {
    const target = event ?? this.eventForm;
    return !target.envoyeAuRssi && this.isEventFormComplete(target);
  }

  private sanitizeIncidentPayload(incident: Incident): Incident {
    const payload = { ...incident };
    const dateFields: (keyof Incident)[] = [
      'mesureDDT', 'mesureDateCloture', 'mesureHeureCloture', 'traitementDDT', 'traitementDateCloture',
      'correctiveDateDebut', 'correctiveDateCloture', 'dateMesureEfficacite', 'suiviDate',
      'heureAttenuation', 'traitementHDT', 'traitementHeureCloture', 'heureTraitement'
    ];
    dateFields.forEach(field => {
      if (payload[field] === '') {
        (payload as any)[field] = null;
      }
    });
    return payload;
  }

  private prepareIncidentFormDefaults(): void {
    this.incidentForm = {
      ...this.initIncidentForm(this.incidentForm.evenement?.id || 0),
      ...this.incidentForm,
      evenement: { ...(this.incidentForm.evenement || {}), id: this.incidentForm.evenement?.id || 0 }
    };

    this.incidentForm.typesIncident = this.incidentForm.typesIncident || [];
    this.incidentForm.impactContinuite = this.incidentForm.impactContinuite ?? false;
    this.incidentForm.changementDeclenche = this.incidentForm.changementDeclenche ?? false;
    this.incidentForm.miseAJourPcaNecessaire = this.incidentForm.miseAJourPcaNecessaire ?? false;
    this.incidentForm.risquesAMettreAJour = this.incidentForm.risquesAMettreAJour ?? false;
    this.incidentForm.evenementsSimilaires = (this.incidentForm.evenementsSimilaires && typeof this.incidentForm.evenementsSimilaires === 'string') 
      ? this.incidentForm.evenementsSimilaires 
      : 'Non';
    this.incidentForm.suiviAuteur = this.incidentForm.suiviAuteur || this.apiService.currentUser()?.username || '';
    this.incidentForm.suiviDate = this.toDateInputValue(this.incidentForm.suiviDate) || new Date().toISOString().slice(0, 10);

    // La durée est immédiatement visible, même pour un incident encore ouvert.
    this.onUnavailabilityTimeChange();
  }

  loadEvents(): void {
    this.apiService.getEvents().subscribe({
      next: (data) => this.events.set(data),
      error: () => this.errorMsg.set('Erreur lors du chargement des événements.')
    });
  }

  loadIncidents(): void {
    this.apiService.getIncidents().subscribe({
      next: (data) => this.incidents.set(data),
      error: () => this.errorMsg.set('Erreur lors du chargement des incidents.')
    });
  }

  loadRisks(): void {
    this.apiService.getRisks().subscribe({
      next: (data) => this.risks.set(data || []),
      error: () => { /* Le catalogue peut rester dérivé des incidents. */ }
    });
  }

  loadLogs(): void {
    this.apiService.getLogs().subscribe({
      next: (data) => this.logs.set(data),
      error: () => this.errorMsg.set('Erreur lors du chargement du journal d\'audit.')
    });
  }

  // --- Evenement Operations ---
  openCreateEvent(): void {
    this.eventForm = this.initEventForm();
    this.eventForm.declarePar = this.apiService.currentUser()?.username || '';
    this.selectedEvent.set(null);
    this.showEventForm.set(true);
  }

  openUserModal(): void {
    this.openSettings();
  }


  openAssistant(): void {
    this.activeTab.set('assistant');
    this.successMsg.set('');
    this.errorMsg.set('');
    this.prepareAssistantSelection();
    this.closeSidebar();
  }

  private prepareAssistantSelection(): void {
    // L'événement est déduit automatiquement depuis la question et la conversation.
  }

  sendAssistantMessage(): void {
    const question = this.assistantQuestion.trim();
    if (!question) {
      this.errorMsg.set('Décrivez le problème ou posez une question à l’assistant.');
      return;
    }


    this.errorMsg.set('');
    const history = this.assistantMessages()
      .filter(message => message.role === 'user')
      .slice(-4)
      .map(message => ({ role: message.role, text: message.text }));
    this.assistantMessages.update(messages => [...messages, { role: 'user', text: question }]);
    this.assistantLoading.set(true);

    this.apiService.runLocalRssiAssistant({
      eventId: this.assistantSelectedEventId,
      question,
      history
    }).subscribe({
      next: (result: AssistantResponse) => {
        this.assistantResult.set(result);
        this.assistantMessages.update(messages => [
          ...messages,
          { role: 'assistant', text: `${result.answer}\n\n${result.confirmationPrompt}` }
        ]);
        this.assistantQuestion = '';
        this.assistantLoading.set(false);
        if (this.assistantAutoSpeak()) this.speakAssistantAnswer(result.answer);
      },
      error: (err) => {
        const message = err?.error?.message
          || 'L’assistant local ne répond pas. Consultez le diagnostic affiché par Spring Boot.';
        this.errorMsg.set(message);
        this.assistantMessages.update(messages => [
          ...messages,
          { role: 'assistant', text: message }
        ]);
        this.assistantLoading.set(false);
      }
    });
  }

  toggleAssistantSpeech(): void {
    this.assistantAutoSpeak.update(value => !value);
    if (!this.assistantAutoSpeak() && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  speakAssistantAnswer(text?: string): void {
    const content = (text || this.assistantResult()?.answer || '').trim();
    if (!content || !('speechSynthesis' in window)) {
      if (!('speechSynthesis' in window)) {
        this.errorMsg.set('La lecture vocale n’est pas disponible dans ce navigateur.');
      }
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      content.replace(/\*\*/g, '').replace(/[#•]/g, ' ')
    );
    utterance.lang = 'fr-FR';
    utterance.rate = 0.96;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  applyAssistantActions(): void {
    const result = this.assistantResult();
    const eventId = result?.selectedEventId ?? this.assistantInferredEventId;
    if (!result || !eventId) {
      this.errorMsg.set("L'assistant n'a pas identifié l'événement concerné. Mentionnez son titre, son ticket ou son code erreur.");
      return;
    }

    const event = this.events().find(item => item.id === eventId);
    if (!event) {
      this.errorMsg.set('Événement introuvable.');
      return;
    }

    const existingIncident = this.findIncidentForEvent(eventId);
    if (existingIncident) {
      this.openEditIncident(existingIncident);
    } else {
      this.selectedEvent.set(event);
      this.selectedIncident.set(null);
      this.incidentForm = this.initIncidentForm(eventId);
      this.prepareIncidentFormDefaults();
      this.showIncidentForm.set(true);
    }

    const draft = result.incidentDraft || {};
    const actionsText = result.actions.map((action, index) => `${index + 1}. ${action}`).join('\n');
    this.assistantAutofillActive.set(true);
    this.animateIncidentDraft([
      ['typesIncident', draft.typesIncident || this.incidentForm.typesIncident],
      ['niveauImpact', draft.niveauImpact || this.incidentForm.niveauImpact],
      ['mesureAction', draft.mesureAction || this.incidentForm.mesureAction],
      ['mesureEtat', draft.mesureEtat || this.incidentForm.mesureEtat || 'En cours'],
      ['traitementAction', draft.traitementAction || actionsText || this.incidentForm.traitementAction],
      ['traitementEtat', draft.traitementEtat || this.incidentForm.traitementEtat || 'En cours'],
      ['preconisation', draft.preconisation || result.answer || this.incidentForm.preconisation],
      ['actionCorrective', draft.actionCorrective || this.incidentForm.actionCorrective],
      ['impactContinuite', draft.impactContinuite ?? this.incidentForm.impactContinuite],
      ['impactContinuiteDescription', draft.impactContinuiteDescription || this.incidentForm.impactContinuiteDescription],
      ['changementDeclenche', draft.changementDeclenche ?? this.incidentForm.changementDeclenche],
      ['changementDeclencheDescription', draft.changementDeclencheDescription || this.incidentForm.changementDeclencheDescription],
      ['risques', (draft.risques || this.incidentForm.risques || []).map(risk => ({ ...risk, reference: risk.reference || '' }))]
    ]);
  }

  private animateIncidentDraft(entries: Array<[keyof Incident, any]>): void {
    const useful = entries.filter(([, value]) => value !== undefined && value !== null && value !== '');
    useful.forEach(([field, value], index) => {
      window.setTimeout(() => {
        (this.incidentForm as any)[field] = value;
        this.cdr.detectChanges();
        if (index === useful.length - 1) {
          this.assistantAutofillActive.set(false);
          this.successMsg.set("Le plan d'incident a été rempli progressivement par l'assistant. Vérifiez chaque champ avant d'enregistrer.");
          this.errorMsg.set('');
        }
      }, index * 240);
    });
    if (useful.length === 0) {
      this.assistantAutofillActive.set(false);
      this.errorMsg.set("L'assistant n'a fourni aucun champ exploitable pour le plan d'incident.");
    }
  }

  cancelAssistantProposal(): void {
    if (!this.assistantResult()) {
      return;
    }
    this.assistantResult.set(null);
    this.assistantMessages.update(messages => [
      ...messages,
      {
        role: 'assistant',
        text: 'Proposition annulée. Aucune action n’a été ajoutée au plan d’incident. Vous pouvez préciser le contexte et poser une nouvelle question.'
      }
    ]);
    this.successMsg.set('Proposition annulée sans modification du plan d’incident.');
    this.errorMsg.set('');
  }

  clearAssistantConversation(): void {
    this.assistantResult.set(null);
    this.assistantQuestion = '';
    this.assistantInferredEventId = null;
    this.assistantMessages.set([
      {
        role: 'assistant',
        text: 'Nouvelle conversation prête. Décrivez l’événement par son titre, son ticket, son code erreur ou son contexte.'
      }
    ]);
  }

  openSettings(): void {
    const current = this.apiService.currentUser();
    this.userForm = {
      username: current?.username || '',
      email: current?.email || '',
      role: current?.role || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
    this.activeTab.set('settings');
    this.successMsg.set('');
    this.errorMsg.set('');
    this.closeSidebar();
  }

  toggleProductUpdates(): void {
    this.productUpdates.update(value => !value);
  }

  saveUserProfile(): void {
    const user = this.apiService.currentUser();
    const trimmedUsername = (this.userForm.username || '').trim();
    const trimmedEmail = (this.userForm.email || '').trim();
    const newPassword = this.userForm.newPassword || '';
    const emailChanged = trimmedEmail.toLowerCase() !== (user?.email || '').trim().toLowerCase();
    const passwordChanged = newPassword.length > 0;

    this.successMsg.set('');
    this.errorMsg.set('');

    if (!trimmedUsername) {
      this.errorMsg.set("Le nom d'utilisateur ne peut pas être vide.");
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      this.errorMsg.set("Veuillez saisir une adresse email valide.");
      return;
    }
    if (passwordChanged && newPassword !== this.userForm.confirmPassword) {
      this.errorMsg.set('La confirmation du nouveau mot de passe ne correspond pas.');
      return;
    }
    if (passwordChanged && !this.isStrongPassword(newPassword)) {
      this.errorMsg.set('Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.');
      return;
    }
    if ((emailChanged || passwordChanged) && !this.userForm.currentPassword) {
      this.errorMsg.set("Saisissez votre mot de passe actuel pour modifier l'email ou le mot de passe.");
      return;
    }
    if (!user?.id) {
      this.errorMsg.set('Impossible de mettre à jour le profil.');
      return;
    }

    this.isSubmitting.set(true);
    this.apiService.updateUserProfile(user.id, {
      username: trimmedUsername,
      email: trimmedEmail,
      role: user.role,
      currentPassword: this.userForm.currentPassword || undefined,
      newPassword: passwordChanged ? newPassword : undefined
    }).subscribe({
      next: () => {
        localStorage.setItem('telnet_product_updates', String(this.productUpdates()));
        this.userForm.currentPassword = '';
        this.userForm.newPassword = '';
        this.userForm.confirmPassword = '';
        this.successMsg.set(passwordChanged ? 'Profil et mot de passe mis à jour avec succès.' : 'Profil mis à jour avec succès.');
        this.errorMsg.set('');
        this.isSubmitting.set(false);
      },
      error: (err) => {
        const message = err?.error?.message || 'Erreur lors de la sauvegarde du profil.';
        this.errorMsg.set(message);
        this.isSubmitting.set(false);
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

  findIncidentForEvent(eventId: number): Incident | undefined {
    return this.incidents().find(inc => inc.evenement?.id === eventId);
  }

  openEditEvent(event: Evenement): void {
    this.selectedEvent.set(event);
    this.eventForm = { ...event };
    if (event.dateHeureDetection) {
      this.eventForm.dateHeureDetection = event.dateHeureDetection.slice(0, 16);
    }
    this.eventForm.natureEvenement = this.eventForm.natureEvenement || 'Indisponibilite';
    this.eventForm.etat = this.eventForm.etat || 'OPEN';
    this.eventForm.impactNiveau = this.eventForm.impactNiveau || 'Aucun';
    this.showEventForm.set(true);
  }

  saveEvent(): void {
    const validationError = this.validateEventFormComplete(this.eventForm);
    if (validationError) {
      this.errorMsg.set(validationError);
      return;
    }
    this.eventForm.idTicket = this.eventForm.idTicket.trim();
    this.eventForm.codeErreur = this.eventForm.codeErreur.trim();
    this.eventForm.impactMineur = this.eventForm.impactNiveau === 'Mineur';

    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    const wasEditing = Boolean(this.selectedEvent());

    const operation = wasEditing
      ? this.apiService.updateEvent(this.selectedEvent()!.id!, this.eventForm)
      : this.apiService.createEvent(this.eventForm);

    operation.subscribe({
      next: (saved) => {
        this.successMsg.set(wasEditing
          ? 'Événement mis à jour avec succès.'
          : (this.apiService.isRssi()
              ? 'Événement enregistré avec succès.'
              : 'Événement enregistré avec succès. Cliquez sur « Envoyer au RSSI » pour notifier le RSSI.'));
        this.errorMsg.set('');

        if (this.apiService.isRssi()) {
          this.showEventForm.set(false);
          this.selectedEvent.set(null);
          this.eventForm = this.initEventForm();
        } else if (saved?.id) {
          this.selectedEvent.set({ ...this.eventForm, ...saved });
          this.eventForm = { ...this.eventForm, ...saved };
        }

        this.loadEvents();
        this.loadLogs();
        this.isSubmitting.set(false);
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.message || 'Erreur de validation ou problème de connexion serveur.');
        this.isSubmitting.set(false);
      }
    });
  }

  sendEventToRssi(event?: Evenement): void {
    const formData = event ? { ...event } : { ...this.eventForm };
    const validationError = this.validateEventFormComplete(formData);
    if (validationError) {
      this.errorMsg.set(validationError);
      return;
    }
    if (formData.envoyeAuRssi) {
      this.errorMsg.set('Cet événement a déjà été envoyé au RSSI.');
      return;
    }

    formData.impactMineur = formData.impactNiveau === 'Mineur';
    if (this.isSendingToRssi()) return;
    this.isSendingToRssi.set(true);

    const saveOperation = formData.id
      ? this.apiService.updateEvent(formData.id, formData)
      : this.apiService.createEvent(formData);

    saveOperation.subscribe({
      next: (saved) => {
        const eventId = saved?.id ?? formData.id;
        if (!eventId) {
          this.errorMsg.set('Impossible d\'envoyer au RSSI : événement non enregistré.');
          this.isSendingToRssi.set(false);
          return;
        }

        this.apiService.notifyRssiEvent(eventId).subscribe({
          next: () => {
            this.successMsg.set('Événement enregistré et envoyé au RSSI avec succès.');
            this.errorMsg.set('');
            this.showEventForm.set(false);
            this.selectedEvent.set(null);
            this.loadEvents();
            this.loadLogs();
            this.isSendingToRssi.set(false);
          },
          error: (err) => {
            this.errorMsg.set(err?.error?.message || 'Erreur lors de l\'envoi au RSSI.');
            this.loadEvents();
            this.isSendingToRssi.set(false);
          }
        });
      },
      error: () => {
        this.errorMsg.set('Erreur lors de l\'enregistrement de l\'événement.');
        this.isSendingToRssi.set(false);
      }
    });
  }

  deleteEvent(id: number): void {
    if (confirm('Voulez-vous vraiment supprimer cet événement ?')) {
      this.apiService.deleteEvent(id).subscribe({
        next: () => {
          this.successMsg.set('Événement supprimé.');
          this.loadEvents();
          this.loadLogs();
        },
        error: () => this.errorMsg.set('Erreur lors de la suppression.')
      });
    }
  }

  // --- Qualification Operations ---
  openQualify(event: Evenement): void {
    this.selectedEvent.set(event);
    this.eventForm = { ...event };

    this.eventForm.impactConfidentialite = this.eventForm.impactConfidentialite || 'Aucun';
    this.eventForm.impactIntegrite = this.eventForm.impactIntegrite || 'Aucun';
    this.eventForm.impactDisponibilite = this.eventForm.impactDisponibilite || 'Aucun';
    this.eventForm.commentaireConfidentialite = this.eventForm.commentaireConfidentialite || '';
    this.eventForm.commentaireIntegrite = this.eventForm.commentaireIntegrite || '';
    this.eventForm.commentaireDisponibilite = this.eventForm.commentaireDisponibilite || '';

    const existingIncident = event.id ? this.findIncidentForEvent(event.id) : undefined;
    this.selectedIncident.set(existingIncident || null);
    this.incidentForm = existingIncident
      ? {
          ...this.initIncidentForm(event.id || 0),
          ...existingIncident,
          evenement: { ...(existingIncident.evenement || {}), id: event.id || 0 },
          risques: (existingIncident.risques || []).map(risk => ({ ...risk }))
        }
      : this.initIncidentForm(event.id || 0);
    this.selectedExistingRiskReference = '';
    this.onQualificationChange();
    this.showQualifyForm.set(true);
  }

  onQualificationChange(): void {
    const isIncident = [
      this.eventForm.impactConfidentialite,
      this.eventForm.impactIntegrite,
      this.eventForm.impactDisponibilite
    ].some(val => val === 'Majeur' || val === 'Critique');

    this.qualifyValue = isIncident ? 'INCIDENT' : 'NON_INCIDENT';
  }

  // --- Risks Handling ---
  addRisque(): void {
    this.incidentForm.risques.push({ reference: '', description: '' });
  }

  removeRisque(index: number): void {
    this.incidentForm.risques.splice(index, 1);
  }

  submitQualification(): void {
    const selected = this.selectedEvent();
    if (!selected?.id || this.isSubmitting()) return;

    if (!this.eventForm.impactConfidentialite
        || !this.eventForm.impactIntegrite
        || !this.eventForm.impactDisponibilite) {
      this.errorMsg.set('Renseignez les trois impacts Confidentialité, Intégrité et Disponibilité.');
      return;
    }

    this.onQualificationChange();
    const qualifiedEvent: Evenement = {
      ...selected,
      impactConfidentialite: this.eventForm.impactConfidentialite,
      impactIntegrite: this.eventForm.impactIntegrite,
      impactDisponibilite: this.eventForm.impactDisponibilite,
      commentaireConfidentialite: this.eventForm.commentaireConfidentialite || '',
      commentaireIntegrite: this.eventForm.commentaireIntegrite || '',
      commentaireDisponibilite: this.eventForm.commentaireDisponibilite || '',
      qualification: this.qualifyValue,
      qualifiePar: this.apiService.currentUser()?.username || selected.qualifiePar
    };

    this.isSubmitting.set(true);
    this.errorMsg.set('');
    this.apiService.updateEvent(selected.id, qualifiedEvent).subscribe({
      next: (savedEvent) => {
        const event = { ...qualifiedEvent, ...savedEvent } as Evenement;
        this.selectedEvent.set(event);
        this.showQualifyForm.set(false);

        if (this.qualifyValue !== 'INCIDENT') {
          this.successMsg.set('Événement classé sans suite.');
          this.isSubmitting.set(false);
          this.loadEvents();
          this.loadLogs();
          return;
        }

        const existingIncident = this.findIncidentForEvent(selected.id!);
        if (existingIncident?.id) {
          this.isSubmitting.set(false);
          this.openEditIncident(existingIncident);
          this.successMsg.set('Qualification enregistrée. Le plan d’incident existant est ouvert.');
          this.loadEvents();
          this.loadLogs();
          return;
        }

        const emptyIncident = this.sanitizeIncidentPayload(this.initIncidentForm(selected.id!));
        this.apiService.createIncident(emptyIncident).subscribe({
          next: (savedIncident) => {
            this.incidents.update(items => [...items, savedIncident]);
            this.openEditIncident(savedIncident);
            this.successMsg.set('Événement qualifié comme incident. Complétez maintenant le plan d’incident.');
            this.isSubmitting.set(false);
            this.loadEvents();
            this.loadIncidents();
            this.loadLogs();
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.errorMsg.set(err?.error?.message || 'La qualification est enregistrée, mais le plan d’incident n’a pas pu être créé.');
          }
        });
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMsg.set(err?.error?.message || 'Impossible d’enregistrer la qualification.');
      }
    });
  }

  // --- Incident Operations ---
  openCreateIncident(): void {
    const event = this.events().find(item => item.id);
    if (!event?.id) {
      this.errorMsg.set('Ajoutez d abord un evenement avant de creer un incident.');
      this.switchTab('events');
      return;
    }

    this.selectedIncident.set(null);
    this.selectedEvent.set(event);
    this.incidentForm = this.initIncidentForm(event.id);
    this.prepareIncidentFormDefaults();
    this.showIncidentForm.set(true);
  }

  openEditIncident(incident: Incident): void {
    this.selectedIncident.set(incident);
    const eventId = incident.evenement?.id || 0;
    this.incidentForm = {
      ...this.initIncidentForm(eventId),
      ...incident,
      evenement: { ...(incident.evenement || {}), id: eventId }
    };
    this.prepareIncidentFormDefaults();
    this.incidentForm.mesureDDT = this.toDateInputValue(incident.mesureDDT);
    this.incidentForm.mesureDateCloture = this.toDateInputValue(incident.mesureDateCloture);
    this.incidentForm.mesureHeureCloture = this.toTimeInputValue(incident.mesureHeureCloture);
    this.incidentForm.traitementDDT = this.toDateInputValue(incident.traitementDDT);
    this.incidentForm.traitementDateCloture = this.toDateInputValue(incident.traitementDateCloture);
    this.incidentForm.correctiveDateDebut = this.toDateInputValue(incident.correctiveDateDebut);
    this.incidentForm.correctiveDateCloture = this.toDateInputValue(incident.correctiveDateCloture);
    this.incidentForm.dateMesureEfficacite = this.toDateInputValue(incident.dateMesureEfficacite);
    this.incidentForm.suiviDate = this.toDateInputValue(incident.suiviDate);
    this.incidentForm.traitementHDT = this.toTimeInputValue(incident.traitementHDT);
    this.incidentForm.traitementHeureCloture = this.toTimeInputValue(incident.traitementHeureCloture);
    this.incidentForm.risques = (this.incidentForm.risques || []).map(risk => ({
      ...risk,
      reference: (risk.reference || '').trim(),
      description: (risk.description || '').trim()
    }));
    this.onUnavailabilityTimeChange();
    this.showIncidentForm.set(true);
  }

  private toDateInputValue(value?: string): string {
    if (!value) return '';
    return value.length >= 10 ? value.slice(0, 10) : value;
  }

  private toTimeInputValue(value?: string): string {
    if (!value) return '';
    return value.length >= 5 ? value.slice(0, 5) : value;
  }

  toggleIncidentType(type: string): void {
    const index = this.incidentForm.typesIncident.indexOf(type);
    if (index > -1) {
      this.incidentForm.typesIncident.splice(index, 1);
    } else {
      this.incidentForm.typesIncident.push(type);
    }
  }

  onIncidentEventChange(): void {
    this.selectedEvent.set(this.events().find(event => event.id === this.incidentForm.evenement?.id) || null);
    this.onAttenuationTimeChange();
    this.onUnavailabilityTimeChange();
  }

  // --- Automatic Duration Calculations ---
  onAttenuationTimeChange(): void {
    // We compute attenuation duration: time between event.dateHeureDetection and mesureDDT + heureAttenuation
    const event = this.events().find(e => e.id === this.incidentForm.evenement?.id) || this.selectedEvent();
    if (!event || !this.incidentForm.mesureDDT || !this.incidentForm.heureAttenuation) return;

    try {
      const startDt = new Date(event.dateHeureDetection);
      const endDt = new Date(`${this.incidentForm.mesureDDT}T${this.incidentForm.heureAttenuation}`);
      const diffMs = endDt.getTime() - startDt.getTime();

      if (!isNaN(diffMs) && diffMs >= 0) {
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;

        this.incidentForm.dureeAttenuation = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
      }
    } catch (e) {
      // Keep manual value on error
    }
  }

  onTreatmentTimeChange(): void {
    // We compute treatment duration: time between traitementDDT + traitementHDT and traitementDateCloture + traitementHeureCloture
    if (!this.incidentForm.traitementDDT || !this.incidentForm.traitementHDT ||
        !this.incidentForm.traitementDateCloture || !this.incidentForm.traitementHeureCloture) return;

    try {
      const startDt = new Date(`${this.incidentForm.traitementDDT}T${this.incidentForm.traitementHDT}`);
      const endDt = new Date(`${this.incidentForm.traitementDateCloture}T${this.incidentForm.traitementHeureCloture}`);
      const diffMs = endDt.getTime() - startDt.getTime();

      if (!isNaN(diffMs) && diffMs >= 0) {
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;

        this.incidentForm.dureeTraitement = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
      }
    } catch (e) {
      // Keep manual value
    }
  }

  onUnavailabilityTimeChange(): void {
    const event = this.events().find(e => e.id === this.incidentForm.evenement?.id) || this.selectedEvent();
    if (!event?.dateHeureDetection) return;

    const closureCandidates = [
      this.incidentForm.mesureDateCloture && this.incidentForm.mesureHeureCloture
        ? new Date(`${this.incidentForm.mesureDateCloture}T${this.incidentForm.mesureHeureCloture}`)
        : null,
      this.incidentForm.traitementDateCloture && this.incidentForm.traitementHeureCloture
        ? new Date(`${this.incidentForm.traitementDateCloture}T${this.incidentForm.traitementHeureCloture}`)
        : null
    ].filter((value): value is Date => value !== null && !Number.isNaN(value.getTime()));

    const startDt = new Date(event.dateHeureDetection);
    if (Number.isNaN(startDt.getTime())) return;

    const endDt = closureCandidates.length > 0
      ? closureCandidates.reduce((earliest, candidate) =>
          candidate.getTime() < earliest.getTime() ? candidate : earliest
        )
      : new Date();

    if (endDt.getTime() < startDt.getTime()) return;
    this.incidentForm.dureeIndisponibilite = this.formatDurationBetween(startDt, endDt);
  }

  private formatDurationBetween(startDt: Date, endDt: Date): string {
    const totalMinutes = Math.max(0, Math.floor((endDt.getTime() - startDt.getTime()) / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}j`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
    return parts.join(' ');
  }

  saveIncident(): void {
    if (!this.incidentForm.evenement?.id) {
      this.errorMsg.set('Selectionnez l evenement rattache a l incident.');
      return;
    }

    this.onUnavailabilityTimeChange();
    const missingRiskDescription = (this.incidentForm.risques || []).findIndex(risk => !(risk.description || '').trim());
    if (missingRiskDescription >= 0) {
      this.errorMsg.set(`La description du risque n°${missingRiskDescription + 1} est obligatoire.`);
      return;
    }
    this.incidentForm.risques = (this.incidentForm.risques || []).map(risk => ({
      ...risk,
      reference: (risk.reference || '').trim(),
      description: (risk.description || '').trim()
    }));

    // If we're closing, ensure traitementEtat matches
    if (this.incidentForm.traitementDateCloture && this.incidentForm.traitementHeureCloture) {
      this.incidentForm.traitementEtat = 'Clôturé';
    }

    // Sanitize dates to prevent backend parse errors when strings are empty
    const payload = this.sanitizeIncidentPayload(this.incidentForm);

    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    const operation = this.selectedIncident()
      ? this.apiService.updateIncident(this.selectedIncident()!.id!, payload)
      : this.apiService.createIncident(payload);

    operation.subscribe({
      next: () => {
        this.successMsg.set(this.selectedIncident() ? 'Plan de traitement mis à jour.' : 'Incident qualifié et plan créé.');
        this.showIncidentForm.set(false);
        this.loadIncidents();
        this.loadRisks();
        this.loadEvents();
        this.loadLogs();
        this.isSubmitting.set(false);
      },
      error: () => {
        this.errorMsg.set('Erreur lors de la sauvegarde de l\'incident.');
        this.isSubmitting.set(false);
      }
    });
  }

  deleteIncident(id: number): void {
    if (!confirm(`Supprimer définitivement l’incident #${id} ? L’événement associé repassera en attente de qualification.`)) return;

    this.apiService.deleteIncident(id).subscribe({
      next: () => {
        if (this.selectedIncident()?.id === id) {
          this.showIncidentForm.set(false);
          this.selectedIncident.set(null);
        }
        this.successMsg.set(`Incident #${id} supprimé.`);
        this.errorMsg.set('');
        this.loadIncidents();
        this.loadEvents();
        this.loadLogs();
      },
      error: (err) => this.errorMsg.set(err?.error?.message || `Impossible de supprimer l’incident #${id}.`)
    });
  }

  applyLogSearch(): void {
    this.logSearch = this.logSearch.trim();
  }

  startSearchVoice(target: 'events' | 'incidents' | 'logs' | 'assistant'): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.errorMsg.set('La reconnaissance vocale n’est pas disponible. Utilisez une version récente de Chrome ou Edge.');
      return;
    }

    if (this.activeRecognition) this.activeRecognition.stop();

    const recognition = new SpeechRecognition();
    recognition.lang = this.getSpeechLocale(target);
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.continuous = false;
    this.activeVoiceSearch.set(target);
    this.activeRecognition = recognition;

    recognition.onresult = (event: any) => {
      const alternatives = Array.from(event.results?.[0] || []) as any[];
      const rawText = (alternatives
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0]?.transcript || '').trim();
      const text = this.cleanVoiceSearchText(rawText);

      if (target === 'events') {
        this.eventStateFilter = 'ALL';
        this.eventQualificationFilter = 'ALL';
        this.eventRssiFilter = 'ALL';
        this.eventSearch = text;
      }
      if (target === 'incidents') {
        this.incidentStateFilter = 'ALL';
        this.incidentSearch = text;
      }
      if (target === 'logs') this.logSearch = text;
      if (target === 'assistant') this.assistantQuestion = rawText;

      this.activeVoiceSearch.set(null);
      this.activeRecognition = null;
      this.successMsg.set(rawText ? `Recherche vocale : « ${rawText} »` : 'Aucun mot reconnu.');
      queueMicrotask(() => this.cdr.detectChanges());
    };
    recognition.onerror = (event: any) => {
      this.activeVoiceSearch.set(null);
      this.activeRecognition = null;
      const messages: Record<string, string> = {
        'not-allowed': 'Autorisez le microphone dans les paramètres du navigateur.',
        'audio-capture': 'Aucun microphone utilisable n’a été détecté.',
        'no-speech': 'Aucune parole n’a été détectée. Rapprochez-vous du microphone et réessayez.',
        network: 'Le service de reconnaissance vocale du navigateur est indisponible.'
      };
      this.errorMsg.set(messages[event.error] || `Recherche vocale indisponible : ${event.error || 'erreur inconnue'}.`);
      this.cdr.detectChanges();
    };
    recognition.onend = () => {
      this.activeVoiceSearch.set(null);
      this.activeRecognition = null;
      this.cdr.detectChanges();
    };
    recognition.start();
  }

  private getSpeechLocale(_target: 'events' | 'incidents' | 'logs' | 'assistant' | 'dictation'): string {
    return 'fr-FR';
  }

  private cleanVoiceSearchText(value: string): string {
    const commandWords = new Set([
      'cherche', 'chercher', 'recherche', 'rechercher', 'trouve', 'trouver', 'affiche', 'afficher',
      'montre', 'montrer', 'filtre', 'filtrer', 'search', 'find', 'show', 'display', 'filter',
      'moi', 'me', 'pour', 'les', 'des', 'dans', 'le', 'la', 'un', 'une', 'please', 'for'
    ]);
    const normalized = String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9À-ÿ_-]+/g, ' ')
      .trim();
    const cleaned = normalized
      .split(/\s+/)
      .filter(token => token && !commandWords.has(token.toLowerCase()))
      .join(' ')
      .trim();
    return cleaned || value.trim();
  }

  logout(): void {
    this.apiService.logout();
    this.router.navigate(['/login']);
  }

  // --- AI Smart Fill (context-aware) ---
  magicFill(targetField?: string, formContext: 'event' | 'incident' = 'event'): void {
    const rawTitle = this.eventForm.libelleErreur || this.selectedEvent()?.libelleErreur || '';

    if (targetField) {
      const targetObject = formContext === 'event' ? this.eventForm : this.incidentForm;
      const currentValue = String((targetObject as any)[targetField] || '').trim();
      const selected = this.selectedEvent();
      const seed = currentValue
        || [rawTitle, this.eventForm.descriptionDetaillee, selected?.descriptionDetaillee]
          .filter(Boolean)
          .join(' — ')
          .trim();

      if (!seed) {
        this.errorMsg.set('Saisissez quelques mots dans le champ ou dans le titre avant de lancer la génération IA.');
        return;
      }

      this.aiGeneratingField.set(`${formContext}:${targetField}`);
      this.errorMsg.set('');
      this.apiService.generateLocalAiText({
        purpose: formContext === 'event'
          ? 'développer une description professionnelle d’événement de sécurité en 2 ou 3 phrases'
          : `rédiger le champ ${targetField} du plan d’incident en 2 ou 3 phrases`,
        field: targetField,
        seed,
        event: {
          id: selected?.id || this.eventForm.id,
          title: rawTitle,
          description: this.eventForm.descriptionDetaillee || selected?.descriptionDetaillee || '',
          ticket: this.eventForm.idTicket || selected?.idTicket || '',
          errorCode: this.eventForm.codeErreur || selected?.codeErreur || '',
          service: this.eventForm.serviceOsAppli || selected?.serviceOsAppli || '',
          equipment: this.eventForm.equipementHardware || selected?.equipementHardware || '',
          confidentiality: this.eventForm.impactConfidentialite || selected?.impactConfidentialite || '',
          integrity: this.eventForm.impactIntegrite || selected?.impactIntegrite || '',
          availability: this.eventForm.impactDisponibilite || selected?.impactDisponibilite || ''
        },
        incident: this.incidentForm as unknown as Record<string, unknown>
      }).subscribe({
        next: result => {
          (targetObject as any)[targetField] = result.text;
          this.aiGeneratingField.set(null);
          this.successMsg.set(result.modelAvailable === false
            ? 'Texte préparé en mode de secours. Lancez SETUP-LOCAL-AI.cmd pour utiliser le vrai modèle local.'
            : 'Texte généré par le modèle IA local. Vérifiez-le avant l’enregistrement.');
          this.cdr.detectChanges();
        },
        error: err => {
          this.aiGeneratingField.set(null);
          this.errorMsg.set(err?.error?.message || 'La génération IA locale n’est pas disponible.');
        }
      });
      return;
    }

    const title = rawTitle.toLowerCase();
    if (!title) {
      this.errorMsg.set("Veuillez d'abord saisir un titre de problème.");
      return;
    }
    const suggestions = this.buildAiSuggestions(title);
    if (formContext === 'event' || this.showEventForm()) {
      this.eventForm.causesPossibles = this.eventForm.causesPossibles || suggestions.causesPossibles;
      this.eventForm.appreciation = this.eventForm.appreciation || suggestions.appreciation;
      this.eventForm.evaluation = this.eventForm.evaluation || suggestions.evaluation;
      this.eventForm.impact = this.eventForm.impact || suggestions.impact;
      this.eventForm.natureEvenement = this.eventForm.natureEvenement || suggestions.natureEvenement;
      this.eventForm.detecteParSource = this.eventForm.detecteParSource || suggestions.detecteParSource;
      this.eventForm.impactNiveau = this.eventForm.impactNiveau || suggestions.impactNiveau;
      this.applySmartDateFromTitle(title);
    }
    this.successMsg.set('Suggestions ajoutées dans les champs vides.');
  }

  private buildAiSuggestions(title: string) {
    if (title.includes('panne') || title.includes('serveur')) {
      return {
        descriptionDetaillee: 'Le serveur principal a cessé de répondre, entraînant une indisponibilité temporaire des services.',
        causesPossibles: 'Coupure réseau, défaillance matérielle ou surcharge système.',
        appreciation: 'Impact significatif sur la disponibilité des services métiers.',
        evaluation: 'Priorité élevée : intervention immédiate requise.',
        impact: 'Utilisateurs bloqués sur les applications concernées.',
        natureEvenement: 'Indisponibilite',
        detecteParSource: 'SUPERVISION',
        impactNiveau: 'Majeur',
        preconisation: 'Mettre en place une redondance serveur et un plan de bascule.',
        traitementAction: 'Redémarrage contrôlé et vérification des logs système.',
        actionCorrective: 'Remplacement du composant défectueux et renforcement de la supervision.',
        impactContinuiteDescription: 'Interruption partielle des services pendant la panne.',
        commentaireEfficacite: 'Mesures d\'atténuation appliquées, suivi post-incident nécessaire.',
        changementDeclencheDescription: 'Déploiement d\'un correctif ou d\'un patch de sécurité.'
      };
    }
    if (title.includes('feu') || title.includes('incendie') || title.includes('physique')) {
      return {
        descriptionDetaillee: 'Un incident physique a été signalé sur le site ou le datacenter.',
        causesPossibles: 'Surchauffe, défaillance électrique ou incident environnemental.',
        appreciation: 'Risque matériel et opérationnel important.',
        evaluation: 'Situation critique nécessitant une escalade RSSI.',
        impact: 'Accès physique restreint et services impactés.',
        natureEvenement: 'Autre',
        detecteParSource: 'UTILISATEUR',
        impactNiveau: 'Majeur',
        preconisation: 'Renforcer les contrôles environnementaux et le plan PCA.',
        traitementAction: 'Isolation de la zone et sécurisation des équipements.',
        actionCorrective: 'Inspection complète et remise en service progressive.',
        impactContinuiteDescription: 'Activation possible du plan de continuité.',
        commentaireEfficacite: 'Efficacité à valider après remise en service.',
        changementDeclencheDescription: 'Mise à jour des procédures de sécurité physique.'
      };
    }
    if (title.includes('mot de passe') || title.includes('accès') || title.includes('vpn')) {
      return {
        descriptionDetaillee: 'Des tentatives d\'accès suspectes ou un blocage d\'accès ont été constatés.',
        causesPossibles: 'Tentative de connexion abusive, compte verrouillé ou erreur d\'authentification.',
        appreciation: 'Risque modéré sur la sécurité des accès.',
        evaluation: 'Analyse des journaux d\'authentification recommandée.',
        impact: 'Accès limité pour un ou plusieurs utilisateurs.',
        natureEvenement: 'Erreur applicative',
        detecteParSource: 'HELP_DESK',
        impactNiveau: 'Mineur',
        preconisation: 'Renforcer l\'authentification et la politique de mots de passe.',
        traitementAction: 'Réinitialisation des accès et blocage des IP suspectes.',
        actionCorrective: 'Déploiement du MFA et revue des comptes sensibles.',
        impactContinuiteDescription: 'Impact limité à un périmètre utilisateur restreint.',
        commentaireEfficacite: 'Contrôles d\'accès rétablis après action corrective.',
        changementDeclencheDescription: 'Durcissement des règles d\'accès distant.'
      };
    }
    return {
      descriptionDetaillee: 'Anomalie détectée nécessitant une analyse complémentaire.',
      causesPossibles: 'Cause exacte en cours d\'investigation.',
      appreciation: 'Impact à confirmer avec les équipes métiers.',
      evaluation: 'Qualification RSSI requise après collecte des éléments.',
      impact: 'Impact métier à préciser.',
      natureEvenement: 'Autre',
      detecteParSource: 'HELP_DESK',
      impactNiveau: 'Mineur',
      preconisation: 'Documenter l\'incident et renforcer la surveillance.',
      traitementAction: 'Actions correctives à définir selon l\'analyse.',
      actionCorrective: 'Suivi des mesures préventives adaptées.',
      impactContinuiteDescription: 'Continuité à évaluer selon la durée de l\'incident.',
      commentaireEfficacite: 'Efficacité des mesures à mesurer après clôture.',
      changementDeclencheDescription: 'Changement éventuel à planifier après analyse.'
    };
  }

  private applyFieldSuggestion(formContext: 'event' | 'incident', field: string, suggestions: ReturnType<typeof this.buildAiSuggestions>): void {
    const suggestionMap: Record<string, string | undefined> = {
      libelleErreur: this.eventForm.libelleErreur,
      descriptionDetaillee: suggestions.descriptionDetaillee,
      causesPossibles: suggestions.causesPossibles,
      appreciation: suggestions.appreciation,
      evaluation: suggestions.evaluation,
      impact: suggestions.impact,
      preconisation: suggestions.preconisation,
      traitementAction: suggestions.traitementAction,
      actionCorrective: suggestions.actionCorrective,
      impactContinuiteDescription: suggestions.impactContinuiteDescription,
      commentaireEfficacite: suggestions.commentaireEfficacite,
      changementDeclencheDescription: suggestions.changementDeclencheDescription
    };

    const value = suggestionMap[field];
    if (!value) return;

    if (formContext === 'incident') {
      if (!(this.incidentForm as any)[field]) {
        (this.incidentForm as any)[field] = value;
      }
      return;
    }

    if (!(this.eventForm as any)[field]) {
      (this.eventForm as any)[field] = value;
    }
  }

  private applySmartDateFromTitle(title: string): void {
    if (this.eventForm.dateHeureDetection) return;
    const now = new Date();
    if (title.includes('hier')) {
      now.setDate(now.getDate() - 1);
    }
    const hourMatch = title.match(/(\d{1,2})h/);
    if (hourMatch) {
      now.setHours(parseInt(hourMatch[1], 10), 0, 0, 0);
    }
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    this.eventForm.dateHeureDetection = `${year}-${month}-${day}T${hours}:${mins}`;
  }

  // --- Speech to Text ---
  isDictating: { [field: string]: boolean } = {};
  private activeRecognition: any = null;
  private activeDictationField: string | null = null;

  startDictation(formContext: 'event' | 'incident', field: string, index?: number): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.errorMsg.set('Votre navigateur ne supporte pas la reconnaissance vocale (utilisez Chrome ou Edge).');
      return;
    }

    const dictationKey = index !== undefined ? `${field}_${index}` : field;

    if (this.activeDictationField === dictationKey && this.activeRecognition) {
      this.activeRecognition.stop();
      this.activeRecognition = null;
      this.activeDictationField = null;
      this.isDictating[dictationKey] = false;
      return;
    }

    if (this.activeRecognition) {
      this.activeRecognition.stop();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = this.getSpeechLocale('dictation');
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.continuous = false;

    this.isDictating[dictationKey] = true;
    this.activeRecognition = recognition;
    this.activeDictationField = dictationKey;

    recognition.onresult = (event: any) => {
      const speechResult = event.results[0][0].transcript?.trim();
      if (!speechResult) return;

      if (formContext === 'incident' && field === 'risqueDescription' && index !== undefined) {
        const current = this.incidentForm.risques[index]?.description || '';
        this.incidentForm.risques[index].description = current ? `${current} ${speechResult}` : speechResult;
      } else {
        const targetForm = formContext === 'event' ? this.eventForm : this.incidentForm;
        const currentVal = (targetForm as any)[field] || '';
        (targetForm as any)[field] = currentVal ? `${currentVal} ${speechResult}` : speechResult;
      }

      this.successMsg.set('Texte dicté ajouté.');
      this.cdr.detectChanges();
    };

    recognition.onerror = (event: any) => {
      this.isDictating[dictationKey] = false;
      this.activeRecognition = null;
      this.activeDictationField = null;
      this.errorMsg.set(`Erreur micro : ${event.error || 'inconnue'}`);
      this.cdr.detectChanges();
    };

    recognition.onend = () => {
      this.isDictating[dictationKey] = false;
      this.activeRecognition = null;
      this.activeDictationField = null;
      this.cdr.detectChanges();
    };

    try {
      recognition.start();
    } catch {
      this.isDictating[dictationKey] = false;
      this.activeRecognition = null;
      this.activeDictationField = null;
      this.errorMsg.set('Impossible de démarrer le micro. Réessayez.');
    }
  }
}
