package com.example.demo.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.List;

/**
 * Met à niveau les anciennes colonnes VARCHAR du plan d'incident. Certaines
 * bases créées avec les premières versions de l'application conservent une
 * limite de 255 caractères et rejettent les paragraphes générés par l'assistant.
 */
@Component
@Order(100)
public class IncidentSchemaRepair implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;
    private final DataSource dataSource;

    public IncidentSchemaRepair(JdbcTemplate jdbcTemplate, DataSource dataSource) {
        this.jdbcTemplate = jdbcTemplate;
        this.dataSource = dataSource;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!isMySqlFamily()) return;

        List<String> incidentTextColumns = List.of(
                "mesure_action",
                "traitement_action",
                "preconisation",
                "action_corrective",
                "commentaire_efficacite",
                "impact_continuite_description",
                "evenements_details_description",
                "changement_declenche_description",
                "risques_miseajour",
                "risques_miseajour_description",
                "suivi_commentaires"
        );
        for (String column : incidentTextColumns) {
            executeQuietly("ALTER TABLE incidents MODIFY COLUMN `" + column + "` LONGTEXT NULL");
        }
        executeQuietly("ALTER TABLE risques MODIFY COLUMN `description` LONGTEXT NULL");
    }

    private boolean isMySqlFamily() {
        try (Connection connection = dataSource.getConnection()) {
            String name = connection.getMetaData().getDatabaseProductName().toLowerCase();
            return name.contains("mysql") || name.contains("mariadb");
        } catch (Exception ignored) {
            return false;
        }
    }

    private void executeQuietly(String sql) {
        try {
            jdbcTemplate.execute(sql);
        } catch (RuntimeException ignored) {
            // Hibernate peut déjà avoir appliqué la bonne définition; dans ce cas
            // le démarrage ne doit pas être bloqué par cette réparation défensive.
        }
    }
}
