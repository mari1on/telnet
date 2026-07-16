package com.example.demo.service;

import com.example.demo.entity.Evenement;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final String FIXED_RSSI_EMAIL = "telnettunisie@gmail.com";

    private final JavaMailSender mailSender;

    @Value("${app.mail.from}")
    private String fromEmail;

    @Value("${app.mail.rssi}")
    private String defaultRssiEmail;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    @Async
    public void notifyRssiNewEvent(Evenement event) {
        String recipient = resolveRssiEmail();
        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, false, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(recipient);
            helper.setSubject("[TELNET] Nouvel événement " + eventReference(event));
            helper.setText(buildNewEventBody(event), false);
            mailSender.send(mimeMessage);
            log.info("Notification RSSI envoyée à {} pour l'événement {}", recipient, eventReference(event));
        } catch (Exception ex) {
            log.error("Échec d'envoi de la notification RSSI pour l'événement #{} : {}", event.getId(), ex.getMessage(), ex);
        }
    }

    public void sendPasswordResetCode(String recipient, String username, String code) {
        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, false, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(recipient);
            helper.setSubject("[TELNET] Code de réinitialisation du mot de passe");
            helper.setText(buildPasswordResetBody(username, code), false);
            mailSender.send(mimeMessage);
            log.info("Code de réinitialisation envoyé à {}", recipient);
        } catch (Exception ex) {
            log.error("Échec d'envoi du code de réinitialisation à {} : {}", recipient, ex.getMessage(), ex);
            throw new IllegalStateException("Impossible d'envoyer le code par email. Vérifiez la configuration Gmail.", ex);
        }
    }

    private String buildPasswordResetBody(String username, String code) {
        return """
                Bonjour %s,

                Votre code TELNET de réinitialisation du mot de passe est : %s

                Ce code expire dans 10 minutes. Ne le transmettez à personne.
                Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.

                — Plateforme TELNET Sécurité
                """.formatted(nullSafe(username), code);
    }

    private String resolveRssiEmail() {
        if (defaultRssiEmail != null && !defaultRssiEmail.isBlank()) {
            return defaultRssiEmail;
        }
        log.warn("RSSI email forcé vers {} car la configuration est vide", FIXED_RSSI_EMAIL);
        return FIXED_RSSI_EMAIL;
    }

    private String buildNewEventBody(Evenement event) {
        return """
                Bonjour,

                Un nouvel événement de sécurité a été déclaré sur la plateforme TELNET.

                IDENTIFICATION
                Référence événement : %s
                ID technique : %s
                ID Ticket (Helpdesk) : %s
                Code erreur : %s
                Titre : %s

                DÉTECTION
                Date et heure : %s
                Déclaré par : %s
                Source de détection : %s
                État : %s
                Nature : %s

                PÉRIMÈTRE TECHNIQUE
                Serveur / OS / API : %s
                Équipement hardware : %s
                Type d'actif : %s
                Actif affecté : %s

                DESCRIPTION DÉTAILLÉE
                %s

                CAUSES POSSIBLES
                %s

                COMMENTAIRE DE LA SOURCE
                %s

                QUALIFICATION CID ACTUELLE
                Confidentialité : %s
                Intégrité : %s
                Disponibilité : %s
                Qualification : %s

                Connectez-vous à TELNET pour consulter l'événement, compléter la qualification CID et poursuivre le processus de traitement.

                — Plateforme TELNET Sécurité
                """.formatted(
                eventReference(event),
                event.getId() == null ? "Création en cours" : String.valueOf(event.getId()),
                nullSafe(event.getIdTicket()),
                nullSafe(event.getCodeErreur()),
                nullSafe(event.getLibelleErreur()),
                nullSafe(String.valueOf(event.getDateHeureDetection())),
                nullSafe(event.getDeclarePar()),
                nullSafe(event.getDetecteParSource()),
                nullSafe(event.getEtat()),
                nullSafe(event.getNatureEvenement()),
                nullSafe(event.getServiceOsAppli()),
                nullSafe(event.getEquipementHardware()),
                nullSafe(event.getTypeActif()),
                nullSafe(event.getActifAffecte()),
                nullSafe(event.getDescriptionDetaillee()),
                nullSafe(event.getCausesPossibles()),
                nullSafe(event.getCommentaireSource()),
                nullSafe(event.getImpactConfidentialite()),
                nullSafe(event.getImpactIntegrite()),
                nullSafe(event.getImpactDisponibilite()),
                nullSafe(event.getQualification())
        );
    }

    private String eventReference(Evenement event) {
        if (event.getReferenceEvenement() != null && !event.getReferenceEvenement().isBlank()) {
            return event.getReferenceEvenement().trim();
        }
        return event.getId() == null ? "EV-NOUVEAU" : "EV-" + event.getId();
    }

    private String nullSafe(String value) {
        return value == null || value.isBlank() ? "Non renseigné" : value;
    }
}
