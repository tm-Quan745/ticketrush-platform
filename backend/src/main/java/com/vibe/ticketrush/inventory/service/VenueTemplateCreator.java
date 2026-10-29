package com.vibe.ticketrush.inventory.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibe.ticketrush.inventory.dto.VenueTemplateDtos.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
public class VenueTemplateCreator {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public VenueTemplateCreator(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc=jdbc; this.json=json; }

    @Transactional
    public UUID create(CreateVenue request) {
        double stageX=request.stage()==null?request.width()*0.4:request.stage().x();
        double stageY=request.stage()==null?20:request.stage().y();
        double stageWidth=request.stage()==null?request.width()*0.2:request.stage().width();
        double stageHeight=request.stage()==null?60:request.stage().height();
        if (stageX+stageWidth>request.width() || stageY+stageHeight>request.height())
            invalid("Stage must fit inside the venue");
        var codes=new HashSet<String>();
        int total=0;
        for (var section:request.sections()) {
            if (!codes.add(section.code())) invalid("Section codes must be unique");
            if (section.x()+section.width()>request.width() || section.y()+section.height()>request.height())
                invalid("Sections must fit inside the venue");
            if (overlaps(section.x(),section.y(),section.width(),section.height(),stageX,stageY,stageWidth,stageHeight))
                invalid("Sections cannot overlap the stage");
            if (section.type().equals("GA") ? section.rows()!=0 || section.columns()!=0 : section.rows()<1 || section.columns()<1)
                invalid("Seated sections require rows and columns; standing sections must use zero");
            total+=section.rows()*section.columns();
        }
        if (total>20000) invalid("A template supports at most 20000 seats");
        for (int i=0;i<request.sections().size();i++) for (int j=i+1;j<request.sections().size();j++) {
            var a=request.sections().get(i); var b=request.sections().get(j);
            if (overlaps(a.x(),a.y(),a.width(),a.height(),b.x(),b.y(),b.width(),b.height())) invalid("Sections cannot overlap");
        }
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO venues(id,template_key,template_version,name,geometry) VALUES (?,?,1,?,?::jsonb)",
            id,request.templateKey(),request.name().trim(),json.valueToTree(Map.of("width",request.width(),"height",request.height(),
                "stage",List.of(stageX,stageY,stageX+stageWidth,stageY+stageHeight))).toString());
        for (var s:request.sections()) {
            UUID sectionId=UUID.randomUUID();
            var geometry=Map.of("color",s.color(),"polygon",List.of(List.of(s.x(),s.y()),List.of(s.x()+s.width(),s.y()),
                List.of(s.x()+s.width(),s.y()+s.height()),List.of(s.x(),s.y()+s.height())));
            jdbc.update("INSERT INTO sections(id,venue_id,code,name,type,geometry) VALUES (?,?,?,?,?,?::jsonb)",
                sectionId,id,s.code(),s.name().trim(),s.type(),json.valueToTree(geometry).toString());
            List<Object[]> seats=new ArrayList<>();
            for (int row=0;row<s.rows();row++) for (int col=0;col<s.columns();col++)
                seats.add(new Object[]{UUID.randomUUID(),sectionId,"R"+(row+1),row,col+1,col/s.aisleEvery(),
                    s.x()+s.width()*(0.05+0.9*(col+0.5)/s.columns()),s.y()+s.height()*(0.05+0.9*(row+0.5)/s.rows())});
            if (!seats.isEmpty()) jdbc.batchUpdate("INSERT INTO seats(id,section_id,row_label,row_rank,number,adjacency_segment,x,y) VALUES (?,?,?,?,?,?,?,?)",seats);
        }
        return id;
    }
    private static boolean overlaps(double x,double y,double w,double h,double bx,double by,double bw,double bh) {
        return x<bx+bw && x+w>bx && y<by+bh && y+h>by;
    }
    private static void invalid(String message) { throw SeatedInventory.invalid("INVALID_VENUE_TEMPLATE",message); }
}
