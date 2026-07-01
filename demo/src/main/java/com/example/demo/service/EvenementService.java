package com.example.demo.service;

import com.example.demo.entity.Evenement;
import com.example.demo.repository.EvenementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class EvenementService {

    private final EvenementRepository evenementRepository;
    private final AuditLogService auditLogService;

    public List<Evenement> getAllEvenements(String username, boolean isRssi) {
        if (isRssi) {
            return evenementRepository.findAll();
        }
        return evenementRepository.findByDeclarePar(username);
    }

    public Optional<Evenement> getEvenementById(Long id) {
        return evenementRepository.findById(id);
    }

    public Evenement createEvenement(Evenement evenement, String username) {
        if (evenement.getQualification() == null) {
            evenement.setQualification("NON_QUALIFIE");
        }
        evenement.setDeclarePar(username);
        Evenement saved = evenementRepository.save(evenement);
        auditLogService.logAction(username, "Création Événement N° " + saved.getId() + " '" + saved.getLibelleErreur() + "'");
        return saved;
    }

    public Optional<Evenement> updateEvenement(Long id, Evenement details, String username) {
        return evenementRepository.findById(id).map(existing -> {
            boolean wasQualified = details.getQualification() != null && !details.getQualification().equals(existing.getQualification());
            
            existing.setDescriptionDetaillee(details.getDescriptionDetaillee());
            existing.setDateHeureDetection(details.getDateHeureDetection());
            existing.setDetecteParSource(details.getDetecteParSource());
            existing.setIdTicket(details.getIdTicket());
            existing.setCommentaireSource(details.getCommentaireSource());
            existing.setNatureEvenement(details.getNatureEvenement());
            existing.setServiceOsAppli(details.getServiceOsAppli());
            existing.setEquipementHardware(details.getEquipementHardware());
            existing.setLibelleErreur(details.getLibelleErreur());
            existing.setCodeErreur(details.getCodeErreur());
            existing.setCausesPossibles(details.getCausesPossibles());
            existing.setEtat(details.getEtat());
            existing.setAppreciation(details.getAppreciation());
            existing.setEvaluation(details.getEvaluation());
            existing.setImpact(details.getImpact());
            existing.setImpactNiveau(details.getImpactNiveau());
            existing.setImpactMineur(details.getImpactMineur());
            existing.setImpactCommentaire(details.getImpactCommentaire());
            existing.setTypeActif(details.getTypeActif());
            existing.setActifAffecte(details.getActifAffecte());
            
            existing.setImpactConfidentialite(details.getImpactConfidentialite());
            existing.setCommentaireConfidentialite(details.getCommentaireConfidentialite());
            existing.setImpactIntegrite(details.getImpactIntegrite());
            existing.setCommentaireIntegrite(details.getCommentaireIntegrite());
            existing.setImpactDisponibilite(details.getImpactDisponibilite());
            existing.setCommentaireDisponibilite(details.getCommentaireDisponibilite());
            
            if (wasQualified) {
                existing.setQualification(details.getQualification());
                existing.setQualifiePar(username);
            }
            
            Evenement saved = evenementRepository.save(existing);
            
            if (wasQualified) {
                auditLogService.logAction(username, "Qualification de l'Événement N° " + saved.getId() + " : " + saved.getQualification());
            } else {
                auditLogService.logAction(username, "Mise à jour de l'Événement N° " + saved.getId());
            }
            
            return saved;
        });
    }

    public boolean deleteEvenement(Long id, String username) {
        return evenementRepository.findById(id).map(existing -> {
            evenementRepository.delete(existing);
            auditLogService.logAction(username, "Suppression de l'Événement N° " + id);
            return true;
        }).orElse(false);
    }
}
