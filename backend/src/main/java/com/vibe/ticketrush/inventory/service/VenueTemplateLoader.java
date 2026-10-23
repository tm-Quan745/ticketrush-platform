package com.vibe.ticketrush.inventory.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Versioned, server-owned geometry. Loading a new version never edits an old template. */
@Component
@org.springframework.core.annotation.Order(0)
public class VenueTemplateLoader implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public VenueTemplateLoader(JdbcTemplate jdbc,ObjectMapper json) { this.jdbc=jdbc; this.json=json; }
    @Override @Transactional
    public void run(ApplicationArguments args) throws Exception {
        try (var stream=new ClassPathResource("venues/stadium-v1.json").getInputStream()) {
            JsonNode template=json.readTree(stream);
            String key=template.required("key").asText();
            int version=template.required("version").asInt();
            UUID venue=id(key+":"+version);
            int inserted=jdbc.update("INSERT INTO venues(id,template_key,template_version,name,geometry) VALUES (?,?,?,?,?::jsonb) ON CONFLICT(template_key,template_version) DO NOTHING",
                venue,key,version,template.required("name").asText(),template.required("geometry").toString());
            if (inserted==0) return;
            for (JsonNode section:template.required("sections")) {
                UUID sectionId=id(venue+":"+section.required("code").asText());
                int rows=section.required("rows").asInt(), columns=section.required("columns").asInt();
                if (rows<0 || rows>100 || columns<0 || columns>100) throw new IllegalArgumentException("Invalid template dimensions");
                JsonNode polygon=section.required("geometry").required("polygon");
                if (polygon.size()!=4) throw new IllegalArgumentException("Quadrilateral required");
                for (JsonNode point:polygon) {
                    if (point.size()!=2) throw new IllegalArgumentException("Invalid vertex");
                    for (JsonNode coordinate:point)
                        if (!coordinate.isNumber() || !Double.isFinite(coordinate.asDouble()) || Math.abs(coordinate.asDouble())>10000)
                            throw new IllegalArgumentException("Invalid coordinate");
                }
                jdbc.update("INSERT INTO sections(id,venue_id,code,name,type,geometry) VALUES (?,?,?,?,?,?::jsonb)",
                    sectionId,venue,section.required("code").asText(),section.required("name").asText(),section.required("type").asText(),section.required("geometry").toString());
                List<Object[]> seats=new ArrayList<>();
                for (int row=0;row<rows;row++) for (int col=0;col<columns;col++) {
                    // First polygon edge faces the stage; padding keeps seats inside the shape.
                    double u=.05+.9*(col+.5)/columns, v=.05+.9*(row+.5)/rows;
                    double x=coordinate(polygon,0,u,v), y=coordinate(polygon,1,u,v);
                    seats.add(new Object[]{id(sectionId+":"+row+":"+col),sectionId,"R"+(row+1),row,col+1,col/10,x,y,row==0 && col<2});
                }
                jdbc.batchUpdate("INSERT INTO seats(id,section_id,row_label,row_rank,number,adjacency_segment,x,y,accessible) VALUES (?,?,?,?,?,?,?,?,?)",seats);
            }
        }
    }
    private static double coordinate(JsonNode p,int axis,double u,double v) {
        return (1-v)*((1-u)*p.get(0).get(axis).asDouble()+u*p.get(1).get(axis).asDouble())
            +v*((1-u)*p.get(3).get(axis).asDouble()+u*p.get(2).get(axis).asDouble());
    }
    private static UUID id(String value) { return UUID.nameUUIDFromBytes(value.getBytes(StandardCharsets.UTF_8)); }
}
