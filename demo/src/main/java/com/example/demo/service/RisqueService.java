package com.example.demo.service;

import com.example.demo.entity.Risque;
import com.example.demo.repository.RisqueRepository;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class RisqueService {
    private final RisqueRepository risqueRepository;

    public RisqueService(RisqueRepository risqueRepository) {
        this.risqueRepository = risqueRepository;
    }

    public List<Risque> getAllRisques() {
        return risqueRepository.findAll();
    }
}
