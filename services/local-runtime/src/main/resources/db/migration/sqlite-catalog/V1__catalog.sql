-- 全局设置独立于项目文件。
CREATE TABLE canvas_node_color (
    kind TEXT PRIMARY KEY CHECK (kind IN ('object', 'process', 'attribute', 'operation', 'state')),
    stroke TEXT CHECK (length(stroke)=7 AND substr(stroke,1,1)='#' AND substr(stroke,2) NOT GLOB '*[^0-9a-f]*'),
    fill TEXT CHECK (length(fill)=7 AND substr(fill,1,1)='#' AND substr(fill,2) NOT GLOB '*[^0-9a-f]*')
);
