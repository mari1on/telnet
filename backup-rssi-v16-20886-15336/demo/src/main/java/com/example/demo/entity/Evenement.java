package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "evenements")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Evenement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "reference_evenement", unique = true, length = 64)
    private String referenceEvenement;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String descriptionDetaillee;

    private LocalDateTime dateHeureDetection;

    private String detecteParSource; // e.g. "HELP_DESK", "AUTRE"
    
    private String idTicket;

    private String commentaireSource;

    private String natureEvenement;

    private String serviceOsAppli; // service-os-appli

    private String equipementHardware; // Équipement hardware

    private String libelleErreur;

    private String codeErreur;

    @Column(columnDefinition = "TEXT")
    private String causesPossibles;

    private String etat; // e.g. "CLOSE", "OPEN"

    private String appreciation; // appréciation de l'événement

    private String evaluation; // évaluation de l'événement

    private String impact; // impact description

    private String impactNiveau; // e.g. "MINEUR", "MAJEUR"

    private Boolean impactMineur; // impact mineur (true/false)

    @Column(columnDefinition = "TEXT")
    private String impactCommentaire; // commentaire impact

    private String typeActif; // type d'actif

    private String actifAffecte; // actif affecté

    @Builder.Default
    @Column(columnDefinition = "VARCHAR(255) default 'NON_QUALIFIE'")
    private String qualification = "NON_QUALIFIE";

    private String impactConfidentialite;
    
    @Column(columnDefinition = "TEXT")
    private String commentaireConfidentialite;

    private String impactIntegrite;
    
    @Column(columnDefinition = "TEXT")
    private String commentaireIntegrite;

    private String impactDisponibilite;
    
    @Column(columnDefinition = "TEXT")
    private String commentaireDisponibilite;

    private String qualifiePar;

    private String declarePar;

    @Builder.Default
    private Boolean envoyeAuRssi = false;

    private LocalDateTime dateEnvoiRssi;
}
