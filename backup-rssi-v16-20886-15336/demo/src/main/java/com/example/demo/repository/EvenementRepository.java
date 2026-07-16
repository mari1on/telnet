package com.example.demo.repository;

import com.example.demo.entity.Evenement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EvenementRepository extends JpaRepository<Evenement, Long> {
    List<Evenement> findByDeclarePar(String declarePar);

    boolean existsByReferenceEvenementIgnoreCase(String referenceEvenement);
    boolean existsByReferenceEvenementIgnoreCaseAndIdNot(String referenceEvenement, Long id);
    boolean existsByIdTicketIgnoreCase(String idTicket);
    boolean existsByCodeErreurIgnoreCase(String codeErreur);
    boolean existsByIdTicketIgnoreCaseAndIdNot(String idTicket, Long id);
    boolean existsByCodeErreurIgnoreCaseAndIdNot(String codeErreur, Long id);
}
