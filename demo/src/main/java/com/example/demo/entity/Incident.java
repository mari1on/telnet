package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Entity
@Table(name = "incidents")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Incident {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String niveauImpact;

    private String dureeIndisponibilite;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "incident_types", joinColumns = @JoinColumn(name = "incident_id"))
    @Column(name = "type_incident")
    private List<String> typesIncident; // Multiselect: e.g. "Défaillance technique", "dommage physique", etc.

    // Mesures prises pour atténuer l'incident
    private String mesureActionNumero;
    private String mesureAction;
    private String mesureResponsable;
    private String mesureDelai;
    private String mesureEtat;
    private LocalDate mesureDDT; // Date Début Traitement/Atténuation
    private String dureeAttenuation; // durée d'atténuation de l'incident
    private String heureAttenuation; // heure d'atténuation

    // Action de traitement
    private String traitementAction;
    private LocalDate traitementDDT; // DDT
    private LocalTime traitementHDT; // HDT
    private String traitementResponsable;
    private String traitementEtat;
    private LocalDate traitementDateCloture; // date de clôture
    private LocalTime traitementHeureCloture; // heure de clôture
    private String dureeTraitement; // durée de traitement
    private String heureTraitement; // heure de traitement

    // Préconisation / Action corrective
    @Column(columnDefinition = "TEXT")
    private String preconisation;
    private String actionCorrective;
    private String correctiveResponsable;
    private LocalDate correctiveDateDebut;
    private LocalDate correctiveDateCloture;
    private LocalDate dateMesureEfficacite;
    private String efficacite;

    @Column(columnDefinition = "TEXT")
    private String commentaireEfficacite;

    private Boolean evenementsSimilaires;

    private Boolean changementDeclenche;

    @Column(columnDefinition = "TEXT")
    private String changementDeclencheDescription;

    private Boolean miseAJourPcaNecessaire;

    private String referencePca;

    @Column(columnDefinition = "TEXT")
    private String risquesIdentifiesDescription;

    private String risquesIdentifiesReference;

    private Boolean risquesAMettreAJour;

    private String risquesMiseAJour;

    @Column(columnDefinition = "TEXT")
    private String risquesMiseAJourDescription;

    private String suiviEdition;

    private LocalDate suiviDate;

    private String suiviAuteur;

    @Column(columnDefinition = "TEXT")
    private String suiviCommentaires;

    @ManyToOne
    @JoinColumn(name = "evenement_id")
    private Evenement evenement;
}
