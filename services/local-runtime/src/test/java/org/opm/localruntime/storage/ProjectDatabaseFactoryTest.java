package org.opm.localruntime.storage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.sql.*;
import static org.junit.jupiter.api.Assertions.*;

class ProjectDatabaseFactoryTest {
 @TempDir Path temporary;
 @Test void migrationIsRepeatableAndKeepsBackendStorage() throws Exception {
  var factory=new ProjectDatabaseFactory(temporary);factory.store().migrate();
  var ready=assertInstanceOf(ProjectDatabaseOpenResult.Ready.class,factory.open("project.first"));
  assertEquals("2.0",ready.database().storageSchemaVersion().value());
  try(var c=factory.databaseScope("project.first").getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT count(*) FROM flyway_schema_history WHERE success AND version='1'")){assertTrue(r.next());assertEquals(1,r.getInt(1));}
  assertTrue(Files.isRegularFile(temporary.resolve("projects/project.first/project.db")));
  assertThrows(IllegalArgumentException.class,()->factory.open("../bad"));
 }
 @Test void sameModelIdInDifferentProjectsIsIsolated() throws Exception {
  var factory=new ProjectDatabaseFactory(temporary);var a=factory.databaseScope("project.alpha");var b=factory.databaseScope("project.beta");
  seed(a,"alpha");seed(b,"beta");
  for(var scope:java.util.List.of(a,b))try(var c=scope.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT name FROM model_catalog WHERE model_id='model.shared'")){
   assertTrue(r.next());assertEquals(scope==a?"alpha":"beta",r.getString(1));assertFalse(r.next());
  }
  for(var scope:java.util.List.of(a,b))try(var c=scope.getConnection();var s=c.createStatement();var r=s.executeQuery("SELECT result_json FROM idempotency_record WHERE command_id='command.shared'")){
   assertTrue(r.next());assertEquals(scope==a?"{\"owner\":\"alpha\"}":"{\"owner\":\"beta\"}",r.getString(1));assertFalse(r.next());
  }
  try(var c=a.getConnection();var s=c.createStatement()){
   assertThrows(SQLException.class,()->s.execute("INSERT INTO model_catalog(model_id,project_id,name,normalized_name,status,profile_binding_json,created_at,updated_at) VALUES('model.escape','project.beta','x','x','ACTIVE','{}','now','now')"));
   if (!JdbcDialect.sqlite(c)) try(var r=s.executeQuery("SELECT current_user")){r.next();assertEquals("opm_diagram_runtime",r.getString(1));}
  }
 }
 private void seed(ProjectScope scope,String name)throws Exception{
  try(var c=scope.getConnection()) {c.setAutoCommit(false);
   try(var s=c.prepareStatement("INSERT INTO project_metadata VALUES(?,?,?,NULL,'ACTIVE','profile.test','1','now','now')")){s.setString(1,scope.projectId());s.setString(2,name);s.setString(3,name);s.executeUpdate();}
   try(var s=c.prepareStatement("INSERT INTO model_catalog(model_id,project_id,name,normalized_name,status,profile_binding_json,created_at,updated_at) VALUES('model.shared',?,?,?,'ACTIVE','{}','now','now')")){s.setString(1,scope.projectId());s.setString(2,name);s.setString(3,name);s.executeUpdate();}
   try(var s=c.prepareStatement("INSERT INTO idempotency_record(operation_id,aggregate_id,command_id,request_digest,result_status,result_json,created_at) VALUES('TEST','model.shared','command.shared','digest','COMMITTED',?,'now')")){s.setString(1,"{\"owner\":\""+name+"\"}");s.executeUpdate();}
   c.commit();
  }
 }
}
