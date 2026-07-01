package com.example.demo.service;

import com.example.demo.entity.Incident;
import com.example.demo.repository.IncidentRepository;
import com.example.demo.repository.EvenementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class IncidentService {

    private final IncidentRepository incidentRepository;
    private final EvenementRepository evenementRepository;
    private final AuditLogService auditLogService;

    public List<Incident> getAllIncidents() {
        return incidentRepository.findAll();
    }

    public Optional<Incident> getIncidentById(Long id) {
        return incidentRepository.findById(id);
    }

    public Incident createIncident(Incident incident, String username) {
        if (incident.getEvenement() != null && incident.getEvenement().getId() != null) {
            evenementRepository.findById(incident.getEvenement().getId())
                .ifPresent(incident::setEvenement);
        }
        if (incident.getRisques() != null) {
            incident.getRisques().forEach(r -> r.setIncident(incident));
        }
        Incident saved = incidentRepository.save(incident);
        auditLogService.logAction(username, "Création de l'Incident N° " + saved.getId() + " lié à l'Événement N° " + (saved.getEvenement() != null ? saved.getEvenement().getId() : "null"));
        return saved;
    }

    public Optional<Incident> updateIncident(Long id, Incident details, String username) {
        return incidentRepository.findById(id).map(existing -> {
            boolean wasClosedNow = "Clôturé".equalsIgnoreCase(details.getTraitementEtat()) && !"Clôturé".equalsIgnoreCase(existing.getTraitementEtat());
            
            existing.setTypesIncident(details.getTypesIncident());
            existing.setNiveauImpact(details.getNiveauImpact());
            existing.setDureeIndisponibilite(details.getDureeIndisponibilite());
            
            // Attenuation
            existing.setMesureActionNumero(details.getMesureActionNumero());
            existing.setMesureAction(details.getMesureAction());
            existing.setMesureResponsable(details.getMesureResponsable());
            existing.setMesureDelai(details.getMesureDelai());
            existing.setMesureEtat(details.getMesureEtat());
            existing.setMesureDDT(details.getMesureDDT());
            existing.setDureeAttenuation(details.getDureeAttenuation());
            existing.setHeureAttenuation(details.getHeureAttenuation());

            // Traitement
            existing.setTraitementAction(details.getTraitementAction());
            existing.setTraitementDDT(details.getTraitementDDT());
            existing.setTraitementHDT(details.getTraitementHDT());
            existing.setTraitementResponsable(details.getTraitementResponsable());
            existing.setTraitementEtat(details.getTraitementEtat());
            existing.setTraitementDateCloture(details.getTraitementDateCloture());
            existing.setTraitementHeureCloture(details.getTraitementHeureCloture());
            existing.setDureeTraitement(details.getDureeTraitement());
            existing.setHeureTraitement(details.getHeureTraitement());

            // Correction
            existing.setPreconisation(details.getPreconisation());
            existing.setActionCorrective(details.getActionCorrective());
            existing.setCorrectiveResponsable(details.getCorrectiveResponsable());
            existing.setCorrectiveDateDebut(details.getCorrectiveDateDebut());
            existing.setCorrectiveDateCloture(details.getCorrectiveDateCloture());
            existing.setDateMesureEfficacite(details.getDateMesureEfficacite());
            existing.setEfficacite(details.getEfficacite());
            existing.setCommentaireEfficacite(details.getCommentaireEfficacite());

            // Details, PCA and risks
            existing.setHasRisquesAssocies(details.getHasRisquesAssocies());
            existing.setImpactContinuite(details.getImpactContinuite());
            existing.setImpactContinuiteDescription(details.getImpactContinuiteDescription());
            existing.setCapitalisation(details.getCapitalisation());

            existing.setEvenementsSimilaires(details.getEvenementsSimilaires());
            existing.setChangementDeclenche(details.getChangementDeclenche());
            existing.setChangementDeclencheDescription(details.getChangementDeclencheDescription());
            existing.setMiseAJourPcaNecessaire(details.getMiseAJourPcaNecessaire());
            existing.setReferencePca(details.getReferencePca());

            existing.getRisques().clear();
            if (details.getRisques() != null) {
                details.getRisques().forEach(r -> {
                    r.setIncident(existing);
                    existing.getRisques().add(r);
                });
            }

            existing.setRisquesAMettreAJour(details.getRisquesAMettreAJour());
            existing.setRisquesMiseAJour(details.getRisquesMiseAJour());
            existing.setRisquesMiseAJourDescription(details.getRisquesMiseAJourDescription());

            // Incident tracking file metadata
            existing.setSuiviEdition(details.getSuiviEdition());
            existing.setSuiviDate(details.getSuiviDate());
            existing.setSuiviAuteur(details.getSuiviAuteur());
            existing.setSuiviCommentaires(details.getSuiviCommentaires());

            // Associated Evenement
            if (details.getEvenement() != null && details.getEvenement().getId() != null) {
                evenementRepository.findById(details.getEvenement().getId())
                    .ifPresent(existing::setEvenement);
            } else {
                existing.setEvenement(null);
            }

            Incident saved = incidentRepository.save(existing);
            if (wasClosedNow) {
                auditLogService.logAction(username, "Incident N° " + saved.getId() + " Clôturé.");
            } else {
                auditLogService.logAction(username, "Mise à jour de l'Incident N° " + saved.getId());
            }
            return saved;
        });
    }

    public boolean deleteIncident(Long id, String username) {
        return incidentRepository.findById(id).map(existing -> {
            incidentRepository.delete(existing);
            auditLogService.logAction(username, "Suppression de l'Incident N° " + id);
            return true;
        }).orElse(false);
    }
}
