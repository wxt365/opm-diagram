package org.opm.localruntime.application;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ImportedLayoutNormalizerTest {
    private final ObjectMapper json = new ObjectMapper();
    private ObjectNode document() throws Exception {
        return (ObjectNode) json.readTree("""
            {"contexts":[{"context_id":"root"},{"context_id":"child","refinee_element_id":"parent"}],
             "elements":[{"element_id":"a","name":{"local_name":"输入"}},
                {"element_id":"b","name":{"local_name":"执行"}},{"element_id":"parent","name":{"local_name":"细化过程"}}],
             "features":[],"states":[],"facts":[],"refinement_edges":[],"occurrences":[],"layouts":[]}
            """);
    }
    private void node(ObjectNode doc, String context, String id, String role, String target, double x, double y) {
        doc.withArray("occurrences").addObject().put("context_id",context).put("occurrence_id",id)
            .put("target_kind",role.contains("STATE") ? "STATE" : role.contains("ATTRIBUTE") ? "FEATURE" : "ELEMENT")
            .put("target_id",target).put("construct_role",role).put("ownership","OWNED").put("layout_id",id);
        doc.withArray("layouts").addObject().put("layout_id",id).put("x",x).put("y",y).put("width",170).put("height",90).put("z_order",1);
    }
    @Test void repairsEveryContextAndIsStableWithoutChangingSemantics() throws Exception {
        var doc=document(); node(doc,"root","r.a","OBJECT_NODE","a",80,80); node(doc,"root","r.b","PROCESS_NODE","b",90,90);
        node(doc,"child","c.parent","PROCESS_NODE","parent",0,0);
        node(doc,"child","c.a","OBJECT_NODE","a",680,170); node(doc,"child","c.b","PROCESS_NODE","b",710,160);
        var semantics=doc.deepCopy(); semantics.remove("layouts");
        ImportedLayoutNormalizer.normalize(doc);
        assertSeparated(doc, "r.a", "r.b"); assertSeparated(doc,"c.a","c.b");
        var result=doc.deepCopy(); ImportedLayoutNormalizer.normalize(doc); assertEquals(result,doc);
        var after=doc.deepCopy(); after.remove("layouts"); assertEquals(semantics,after);
    }
    @Test void preservesGoodPositionsAndManualPathsInUnaffectedContext() throws Exception {
        var doc=document(); node(doc,"root","a","OBJECT_NODE","a",80,80); node(doc,"root","b","PROCESS_NODE","b",500,80);
        ((ObjectNode)doc.path("layouts").get(0)).putArray("edge_routes").addObject().put("mode","MANUAL");
        var before=doc.deepCopy(); ImportedLayoutNormalizer.normalize(doc); assertEquals(before,doc);
    }
    @Test void preservesReferenceGeometryAndMovesOwnedNodesAroundIt() throws Exception {
        var doc=document(); node(doc,"root","ref","OBJECT_NODE","a",80,80);node(doc,"root","owned","PROCESS_NODE","b",80,80);
        ((ObjectNode)doc.path("occurrences").get(0)).put("ownership","REFERENCED");
        var reference=layout(doc,"ref").deepCopy();ImportedLayoutNormalizer.normalize(doc);
        assertEquals(reference,layout(doc,"ref"));assertSeparated(doc,"ref","owned");
        var result=doc.deepCopy();ImportedLayoutNormalizer.normalize(doc);assertEquals(result,doc);
    }
    @Test void factsVisibleOnlyInAnotherContextDoNotChangeThisContextLayout() throws Exception {
        var doc=document();node(doc,"root","a","OBJECT_NODE","a",80,80);node(doc,"root","b","PROCESS_NODE","b",80,80);
        var without=doc.deepCopy();
        doc.withArray("facts").addObject().put("fact_id","foreign").putArray("endpoints")
            .addObject().put("target_id","b").put("ordinal",0);
        ((ObjectNode)doc.path("facts").get(0)).withArray("endpoints").addObject().put("target_id","a").put("ordinal",1);
        doc.withArray("occurrences").addObject().put("context_id","child").put("target_kind","FACT").put("target_id","foreign");
        ImportedLayoutNormalizer.normalize(doc);ImportedLayoutNormalizer.normalize(without);
        assertEquals(without.path("layouts"),doc.path("layouts"));
    }
    @Test void longOwnerAndStateLabelsReserveSeparateTextAreas() throws Exception {
        var doc=document();((ObjectNode)doc.path("elements").get(0).path("name")).put("local_name","长对象标题".repeat(12));
        node(doc,"root","a","OBJECT_NODE","a",80,80);
        doc.withArray("states").addObject().put("state_id","long").put("owner_element_id","a").putObject("name").put("local_name","长状态说明".repeat(20));
        node(doc,"root","s","STATE_NODE","long",80,80);
        ImportedLayoutNormalizer.normalize(doc);
        var owner=layout(doc,"a");var state=layout(doc,"s");
        assertTrue(state.path("y").asDouble()>owner.path("y").asDouble()+28);
        assertTrue(state.path("height").asDouble()>90);
        assertTrue(state.path("y").asDouble()+state.path("height").asDouble()<=owner.path("y").asDouble()+owner.path("height").asDouble()-8);
        var result=doc.deepCopy();ImportedLayoutNormalizer.normalize(doc);assertEquals(result,doc);
    }
    @Test void manyStackedNodesAndLongNamesUseBoundedLayersWithoutOverlap() throws Exception {
        var doc=document();
        for(int i=0;i<150;i++) {
            String id="n"+i;
            doc.withArray("elements").addObject().put("element_id",id).putObject("name").put("local_name","长业务对象名称".repeat(i%8+1));
            node(doc,i%2==0?"root":"child",id,"OBJECT_NODE",id,80,80);
        }
        ImportedLayoutNormalizer.normalize(doc);
        for(int i=0;i<150;i++)for(int j=i%2;j<i;j+=2)assertSeparated(doc,"n"+i,"n"+j);
        var once=doc.deepCopy();ImportedLayoutNormalizer.normalize(doc);assertEquals(once,doc);
    }
    @Test void containsMultipleStatesAndMovesTheirOwnerAsAGroup() throws Exception {
        var doc=document(); node(doc,"root","a","OBJECT_NODE","a",80,80); node(doc,"root","b","PROCESS_NODE","b",100,100);
        for(int i=0;i<8;i++) {
            doc.withArray("states").addObject().put("state_id","s"+i).put("owner_element_id","a").putObject("name").put("local_name","状态"+i);
            node(doc,"root","s"+i,"STATE_NODE","s"+i,90,100);
        }
        ImportedLayoutNormalizer.normalize(doc); assertSeparated(doc,"a","b");
        var owner=layout(doc,"a");
        for(int i=0;i<8;i++) { var state=layout(doc,"s"+i);
            assertTrue(state.path("x").asDouble()>=owner.path("x").asDouble()+8);
            assertTrue(state.path("y").asDouble()>=owner.path("y").asDouble()+28);
            assertTrue(state.path("y").asDouble()+state.path("height").asDouble()<=owner.path("y").asDouble()+owner.path("height").asDouble()-8);
            for(int j=0;j<i;j++) assertSeparated(doc,"s"+i,"s"+j);
        }
        var result=doc.deepCopy(); ImportedLayoutNormalizer.normalize(doc); assertEquals(result,doc);
    }
    private ObjectNode layout(ObjectNode doc,String id) { for(var n:doc.path("layouts")) if(n.path("layout_id").asText().equals(id)) return (ObjectNode)n; throw new AssertionError(id); }
    private void assertSeparated(ObjectNode doc,String first,String second) {
        var a=layout(doc,first);var b=layout(doc,second);
        assertTrue(a.path("x").asDouble()+a.path("width").asDouble()<=b.path("x").asDouble()
            ||b.path("x").asDouble()+b.path("width").asDouble()<=a.path("x").asDouble()
            ||a.path("y").asDouble()+a.path("height").asDouble()<=b.path("y").asDouble()
            ||b.path("y").asDouble()+b.path("height").asDouble()<=a.path("y").asDouble(),first+" / "+second);
    }
}
