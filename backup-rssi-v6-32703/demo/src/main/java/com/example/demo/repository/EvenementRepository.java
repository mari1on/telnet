package com.example.demo.repository;

import com.example.demo.entity.Evenement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EvenementRepository extends JpaRepository<Evenement, Long> {
    List<Evenement> findByDeclarePar(String declarePar);
    boolean existsByIdTicket(String idTicket);
    boolean existsByCodeErreur(String codeErreur);
}
