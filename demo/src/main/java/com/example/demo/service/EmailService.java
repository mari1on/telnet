package com.example.demo.service;

import com.example.demo.entity.Evenement;
import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

	private final JavaMailSender mailSender;
	private final UserRepository userRepository;

	@Value("${app.mail.from}")
	private String fromEmail;

	@Value("${app.mail.rssi}")
	private String defaultRssiEmail;

	private static final String FIXED_RSSI_EMAIL = "telnettunisie@gmail.com";

	@Async
	public void notifyRssiNewEvent(Evenement event) {

		String recipient = resolveRssiEmail();

		try {
			MimeMessage mimeMessage = mailSender.createMimeMessage();
			MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, false, "UTF-8");

			helper.setFrom(fromEmail);
			helper.setTo(recipient);
			helper.setSubject("[TELNET] Nouveau signalement #EV-" + event.getId());
			helper.setText(buildNewEventBody(event), false);

			mailSender.send(mimeMessage);

			log.info(
				"Notification RSSI envoyée à {} pour l'événement #{}",
				recipient,
				event.getId()
			);

		} catch (Exception ex) {
			log.error(
				"Échec d'envoi de la notification RSSI pour l'événement #{} : {}",
				event.getId(),
				ex.getMessage(),
				ex
			);
		}
	}

	private String resolveRssiEmail() {

		if (defaultRssiEmail != null && !defaultRssiEmail.isBlank()) {
			log.info(
				"RSSI email utilisé depuis la configuration : {}",
				defaultRssiEmail
			);
			return defaultRssiEmail;
		}

		log.warn(
			"RSSI email forcé vers {} car la configuration est vide",
			FIXED_RSSI_EMAIL
		);

		return FIXED_RSSI_EMAIL;
	}

	private String buildNewEventBody(Evenement event) {

		return """
				Bonjour,

				Un nouveau problème a été déclaré sur la plateforme TELNET.

				Référence : #EV-%d
				Titre : %s
				Déclaré par : %s
				Source : %s
				Date de détection : %s

				Description :
				%s

				Connectez-vous à l'application pour qualifier cet événement.

				— Plateforme TELNET Sécurité
				""".formatted(
				event.getId(),
				nullSafe(event.getLibelleErreur()),
				nullSafe(event.getDeclarePar()),
				nullSafe(event.getDetecteParSource()),
				nullSafe(String.valueOf(event.getDateHeureDetection())),
				nullSafe(event.getDescriptionDetaillee())
		);
	}

	private String nullSafe(String value) {
		return (value == null || value.isBlank())
				? "Non renseigné"
				: value;
	}
}