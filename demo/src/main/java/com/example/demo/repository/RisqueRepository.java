package com.example.demo.repository;

import com.example.demo.entity.Risque;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RisqueRepository extends JpaRepository<Risque, Long> {
    List<Risque> findByIncidentId(Long incidentId);
}
