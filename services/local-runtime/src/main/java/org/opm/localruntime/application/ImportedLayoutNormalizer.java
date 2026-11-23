package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
import org.opm.localruntime.api.ApiException;
import org.opm.localruntime.api.ApiErrorCode;

/** Import-only presentation repair. Semantic identities and existing saved revisions are untouched. */
final class ImportedLayoutNormalizer {
    private ImportedLayoutNormalizer() { }
    private static final double GAP = 64;

    static void normalize(ObjectNode document) {
        var definitions = new HashMap<String, JsonNode>();
        for (String collection : List.of("elements", "features", "states"))
            for (var node : document.path(collection)) definitions.put(node.path(collection.substring(0, collection.length()-1)+"_id").asText(), node);
        var layouts = new HashMap<String, ObjectNode>();
        for (var layout : document.path("layouts")) layouts.put(layout.path("layout_id").asText(), (ObjectNode)layout);
        var contexts = new TreeMap<String, List<Body>>();
        for (var occurrence : document.path("occurrences")) {
            if (occurrence.path("target_kind").asText().equals("FACT")) continue;
            var layout = layouts.get(occurrence.path("layout_id").asText());
            if (layout == null) continue;
            var definition = definitions.get(occurrence.path("target_id").asText());
            var body = new Body(occurrence, layout, definition);
            contexts.computeIfAbsent(occurrence.path("context_id").asText(), ignored -> new ArrayList<>()).add(body);
        }
        for (var context : document.path("contexts")) {
            var bodies = contexts.getOrDefault(context.path("context_id").asText(), List.of());
            var before = new HashMap<String, JsonNode>();
            bodies.forEach(body -> before.put(body.id, body.layout.deepCopy()));
            String refinee = context.path("refinee_element_id").asText();
            if (refinee.isEmpty()) for (var edge : document.path("refinement_edges"))
                if (edge.path("child_context_id").asText().equals(context.path("context_id").asText())) refinee = edge.path("refinee_element_id").asText();
            String parentId = refinee;
            var content = bodies.stream().filter(body -> !body.target.equals(parentId)).sorted(Comparator.comparing(body -> body.id)).toList();
            content.forEach(Body::fitLabel);
            var byTarget = new HashMap<String, Body>(); content.forEach(body -> byTarget.putIfAbsent(body.target, body));
            for (var owner : content) {
                var states = content.stream().filter(body -> body.state && body.owner.equals(owner.target)).toList();
                if (owner.locked || states.stream().anyMatch(body -> body.locked)) continue;
                var placed = new ArrayList<Body>();
                for (var state : states) {
                    state.fitStateLabel(owner);
                    double left = owner.x()+8, top = owner.y()+owner.header();
                    boolean contained = state.x()>=left && state.y()>=top && state.right()<=owner.right()-8 && state.bottom()<=owner.bottom()-8;
                    if (!contained || placed.stream().anyMatch(other -> overlaps(state,other,8))) {
                        double x=left, y=top;
                        for (var previous : placed) y=Math.max(y,previous.bottom()+8);
                        state.move(x-state.x(),y-state.y());
                    }
                    owner.resize(Math.max(owner.width(),state.right()+8-owner.x()),Math.max(owner.height(),state.bottom()+8-owner.y()));
                    placed.add(state);
                }
            }
            var groups = new LinkedHashMap<Body, List<Body>>();
            for (var body : content) {
                Body root=body; var seen=new HashSet<String>();
                while (!root.owner.isEmpty() && byTarget.containsKey(root.owner) && seen.add(root.id)) root=byTarget.get(root.owner);
                groups.computeIfAbsent(root, ignored -> new ArrayList<>()).add(body);
            }
            var roots = new ArrayList<>(groups.keySet());
            var crowded = new HashSet<Body>();
            for(int i=0;i<roots.size();i++) for(int j=0;j<i;j++) if(groupOverlap(groups.get(roots.get(i)),groups.get(roots.get(j)),0)) {
                crowded.add(roots.get(i));crowded.add(roots.get(j));
            }
            if(!roots.isEmpty()&&crowded.size()*2>=roots.size()) {
                var movable = new LinkedHashMap<Body,List<Body>>();
                groups.forEach((root,members) -> { if (!fixed(members)) movable.put(root,members); });
                pack(document,context.path("context_id").asText(),movable);
            }
            var ordered = new ArrayList<>(groups.values());
            ordered.sort(Comparator.comparing(group -> !fixed(group)));
            var placed = new ArrayList<List<Body>>();
            for (var group : ordered) {
                if (fixed(group)) { placed.add(group); continue; }
                // Move complete owner/feature/state groups; each step passes an obstacle edge.
                for (int pass=0;pass<=placed.size();pass++) {
                    var collision = placed.stream().filter(other -> groupOverlap(group,other,GAP)).toList();
                    if (collision.isEmpty()) break;
                    double right=collision.stream().flatMap(Collection::stream).mapToDouble(Body::right).max().orElseThrow()+GAP;
                    double bottom=collision.stream().flatMap(Collection::stream).mapToDouble(Body::bottom).max().orElseThrow()+GAP;
                    double dx=right-group.stream().mapToDouble(Body::x).min().orElseThrow();
                    double dy=bottom-group.stream().mapToDouble(Body::y).min().orElseThrow();
                    boolean horizontal=dx<=dy;
                    group.forEach(body -> body.move(horizontal?dx:0,horizontal?0:dy));
                }
                placed.add(group);
            }
            // A feature may overlap its own owner or sibling even when the outer group is clear.
            for (var group : groups.values()) {
                if (fixed(group)) continue;
                var fixed = new ArrayList<Body>();
                for (var body : group.stream().filter(item -> !item.state).sorted(Comparator.comparingInt(item -> item.owner.isEmpty()?0:1)).toList()) {
                    for(int pass=0;pass<=fixed.size();pass++) {
                        var collisions=fixed.stream().filter(other -> overlaps(body,other,32)).toList();
                        if(collisions.isEmpty()) break;
                        double dx=collisions.stream().mapToDouble(Body::right).max().orElseThrow()+64-body.x();
                        body.move(dx,0);
                        for(var state:group) if(state.state&&state.owner.equals(body.target)) state.move(dx,0);
                    }
                    fixed.add(body);
                }
            }
            // Feature expansion may have enlarged a group: validate the final group bounds again.
            placed.clear();
            for(var group:ordered) {
                if (fixed(group)) { placed.add(group); continue; }
                for(int pass=0;pass<=placed.size();pass++) {
                    var collisions=placed.stream().filter(other -> groupOverlap(group,other,GAP)).toList();
                    if(collisions.isEmpty()) break;
                    double dy=collisions.stream().flatMap(Collection::stream).mapToDouble(Body::bottom).max().orElseThrow()+GAP-group.stream().mapToDouble(Body::y).min().orElseThrow();
                    group.forEach(body -> body.move(0,dy));
                }
                placed.add(group);
            }
            for (int i=0;i<content.size();i++) for (int j=0;j<i;j++) {
                var a=content.get(i);var b=content.get(j);
                boolean containment = a.state && a.owner.equals(b.target) || b.state && b.owner.equals(a.target);
                if (!containment && overlaps(a,b,0)) throw new ApiException(ApiErrorCode.VALIDATION_BLOCKED,422,false,
                    "导入图存在无法自动消除的元素重叠，请检查引用及所属关系："+context.path("context_id").asText()+" / "+a.id+" / "+b.id);
            }
            boolean moved=content.stream().anyMatch(body -> !before.get(body.id).equals(body.layout));
            if (moved) {
                for(var occurrence:document.path("occurrences")) if(occurrence.path("context_id").equals(context.path("context_id"))) {
                    var layout=layouts.get(occurrence.path("layout_id").asText());
                    if(layout!=null) layout.remove("edge_routes");
                }
            }
        }
    }

    /** Missing/stacked coordinates get bounded, stable topology layers, including cyclic components. */
    private static void pack(ObjectNode document,String contextId,Map<Body,List<Body>> groups) {
        var owner=new HashMap<String,Body>(); groups.forEach((root,members)->members.forEach(body->owner.put(body.target,root)));
        var graph=new LinkedHashMap<Body,Set<Body>>();groups.keySet().forEach(root->graph.put(root,new LinkedHashSet<>()));
        var visibleFacts = new HashSet<String>();
        for(var occurrence:document.path("occurrences")) if(occurrence.path("context_id").asText().equals(contextId)
            && occurrence.path("target_kind").asText().equals("FACT")) visibleFacts.add(occurrence.path("target_id").asText());
        for(var fact:document.path("facts")) {
            if(!visibleFacts.contains(fact.path("fact_id").asText())) continue;
            var ends=new ArrayList<JsonNode>();fact.path("endpoints").forEach(ends::add);
            ends.sort(Comparator.comparingInt(end->end.path("ordinal").asInt()));
            if(ends.isEmpty())continue;
            var from=owner.get(ends.get(0).path("target_id").asText());
            for(var end:ends.subList(1,ends.size())) {
                var to=owner.get(end.path("target_id").asText());
                if(from!=null&&to!=null&&from!=to)graph.get(from).add(to);
            }
        }
        var incoming=new HashMap<Body,Integer>();var ranks=new HashMap<Body,Integer>();
        graph.keySet().forEach(body->{incoming.put(body,0);ranks.put(body,0);});
        graph.values().forEach(targets->targets.forEach(body->incoming.merge(body,1,Integer::sum)));
        var queue=new ArrayList<Body>();graph.keySet().stream().filter(body->incoming.get(body)==0).forEach(queue::add);
        for(int i=0;i<queue.size();i++) for(var to:graph.get(queue.get(i))) {
            ranks.put(to,Math.max(ranks.get(to),ranks.get(queue.get(i))+1));
            if(incoming.merge(to,-1,Integer::sum)==0)queue.add(to);
        }
        var layers=new TreeMap<Integer,List<Body>>();
        graph.keySet().forEach(body->layers.computeIfAbsent(ranks.get(body),ignored->new ArrayList<>()).add(body));
        double x=80;
        for(var layer:layers.values()) {
            int rows=(int)Math.ceil(Math.sqrt(layer.size()));double cursorX=x,maxRight=x;
            for(int start=0;start<layer.size();start+=rows) {
                double y=80,columnRight=cursorX;
                for(var root:layer.subList(start,Math.min(layer.size(),start+rows))) {
                    var group=groups.get(root);double left=group.stream().mapToDouble(Body::x).min().orElseThrow(),top=group.stream().mapToDouble(Body::y).min().orElseThrow();
                    double dx=cursorX-left,dy=y-top;group.forEach(body->body.move(dx,dy));
                    y=group.stream().mapToDouble(Body::bottom).max().orElseThrow()+96;
                    columnRight=Math.max(columnRight,group.stream().mapToDouble(Body::right).max().orElseThrow());
                }
                maxRight=Math.max(maxRight,columnRight);cursorX=columnRight+96;
            }
            x=maxRight+144;
        }
    }

    private static boolean groupOverlap(List<Body> a,List<Body> b,double gap) {
        return a.stream().anyMatch(left -> !left.state && b.stream().anyMatch(right -> !right.state && overlaps(left,right,gap)));
    }
    private static boolean fixed(List<Body> group) { return group.stream().anyMatch(body -> body.locked); }
    private static boolean overlaps(Body a,Body b,double gap) {
        return a.x()<b.right()+gap-1e-7&&b.x()<a.right()+gap-1e-7&&a.y()<b.bottom()+gap-1e-7&&b.y()<a.bottom()+gap-1e-7;
    }
    private static final class Body {
        final String id,target,owner,label; final ObjectNode layout; final boolean state,locked;
        Body(JsonNode occurrence,ObjectNode layout,JsonNode definition) {
            this.layout=layout; id=occurrence.path("occurrence_id").asText();target=occurrence.path("target_id").asText();
            state=occurrence.path("target_kind").asText().equals("STATE");
            locked=occurrence.path("ownership").asText().equals("REFERENCED");
            owner=definition==null?"":definition.path("owner_element_id").asText();
            label=definition==null?"":definition.path("name").path("local_name").asText().replaceAll("(?i)<br\\s*/?\\s*>","\n").replaceAll("<[^>]*>","");
        }
        double x(){return layout.path("x").asDouble();} double y(){return layout.path("y").asDouble();}
        double width(){return layout.path("width").asDouble();} double height(){return layout.path("height").asDouble();}
        double right(){return x()+width();} double bottom(){return y()+height();}
        double textWidth(){return label.codePoints().mapToDouble(c -> c>255?13:8).sum();}
        double header(){return Math.max(28,rows(width()-32,13)*18+10);}
        void move(double dx,double dy){if(dx!=0)layout.put("x",x()+dx);if(dy!=0)layout.put("y",y()+dy);}
        void resize(double w,double h){if(w!=width())layout.put("width",w);if(h!=height())layout.put("height",h);}
        double rows(double available,int font){return Arrays.stream(label.split("\\R",-1)).mapToDouble(line -> Math.max(1,Math.ceil(line.codePoints().mapToDouble(c -> c>255?font:8).sum()/Math.max(1,available)))).sum();}
        void fitLabel(){ if(state||locked)return; double w=Math.max(width(),Math.min(300,textWidth()+32));resize(w,Math.max(height(),rows(w-32,13)*18+34)); }
        void fitStateLabel(Body owner){
            double available=Math.max(88,owner.width()-16);
            double longest=Arrays.stream(label.split("\\R",-1)).mapToDouble(line -> line.codePoints().mapToDouble(c -> c>255||"WMwm@%".indexOf(c)>=0?11:8).sum()).max().orElse(0);
            double w=Math.max(width(),Math.min(available,Math.max(88,longest+24)));
            resize(w,Math.max(height(),rows(w-24,11)*16+12));
        }
    }
}
