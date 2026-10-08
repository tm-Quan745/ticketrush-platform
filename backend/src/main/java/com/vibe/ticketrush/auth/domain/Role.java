package com.vibe.ticketrush.auth.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "roles")
public class Role {
    @Id
    private Short id;
    private String name;

    protected Role() {}
    public String getName() { return name; }
}
