package com.vibe.ticketrush.auth.repository;

import com.vibe.ticketrush.auth.domain.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, Short> {
    Optional<Role> findByName(String name);
}
