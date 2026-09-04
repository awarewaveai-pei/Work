from __future__ import annotations
import json, re
from datetime import datetime
from pathlib import Path
class SchemaViolation(ValueError): pass

# $ref resolution: this codebase only ever uses a bare filename $ref pointing to a sibling
# schema file in the same directory (e.g. answer-snapshot.schema.json -> custom-requirement.
# schema.json) -- no remote/URL refs, no JSON Pointer fragments. validate() itself intentionally
# stays a pure recursive checker with no filesystem access; resolve_refs() is a separate
# preprocessing pass so callers that load a schema decide once, at load time, whether $ref needs
# resolving, instead of every recursive validate() call needing a base-dir parameter threaded
# through it.
def resolve_refs(schema, base_dir, _stack=()):
    if isinstance(schema, dict):
        if '$ref' in schema:
            ref = schema['$ref']
            ref_path = (base_dir / ref).resolve()
            if ref_path in _stack: raise SchemaViolation(f'circular $ref: {ref}')
            target = json.loads(ref_path.read_text(encoding='utf-8'))
            resolved_target = resolve_refs(target, ref_path.parent, _stack + (ref_path,))
            siblings = {k: resolve_refs(v, base_dir, _stack) for k, v in schema.items() if k != '$ref'}
            if not siblings: return resolved_target
            # JSON Schema 2020-12: a $ref's sibling keywords apply ALONGSIDE the referenced
            # schema, not instead of it (both must hold -- AND semantics). A shallow dict merge
            # here would silently let a sibling key of the same name (e.g. both define
            # `required`) overwrite the target's constraint instead of combining with it -- no
            # schema in this codebase currently mixes $ref with siblings, but validate() already
            # has the right primitive for expressing "both of these must hold" (`allOf`), so
            # reuse it instead of inventing a second, subtly-wrong merge rule.
            return {'allOf': [resolved_target, siblings]}
        return {k: resolve_refs(v, base_dir, _stack) for k, v in schema.items()}
    if isinstance(schema, list):
        return [resolve_refs(x, base_dir, _stack) for x in schema]
    return schema

def load_schema(path):
    path = Path(path)
    return resolve_refs(json.loads(path.read_text(encoding='utf-8')), path.parent)

def _type_ok(v,t):
    if t=='null': return v is None
    if t=='object': return isinstance(v,dict)
    if t=='array': return isinstance(v,list)
    if t=='string': return isinstance(v,str)
    if t=='integer': return isinstance(v,int) and not isinstance(v,bool)
    if t=='number': return isinstance(v,(int,float)) and not isinstance(v,bool)
    if t=='boolean': return isinstance(v,bool)
    return True

def validate(instance,schema,path='$'):
    # A raw, unresolved $ref reaching here means a caller loaded the schema with plain
    # json.loads() instead of load_schema() -- every other keyword is silently a no-op against
    # an untouched {"$ref": ...} node (none of the branches below recognize the key), so without
    # this guard the whole subtree validates as "anything goes" instead of failing loudly the
    # moment someone forgets load_schema() for a schema that (now, or in the future) uses $ref.
    if '$ref' in schema: raise SchemaViolation(f'{path}: unresolved $ref {schema["$ref"]!r} -- load schema via load_schema(), not json.loads()')
    if 'allOf' in schema:
        for s in schema['allOf']: validate(instance,s,path)
    if 'if' in schema:
        try: validate(instance,schema['if'],path); matched=True
        except SchemaViolation: matched=False
        if matched and 'then' in schema: validate(instance,schema['then'],path)
        if not matched and 'else' in schema: validate(instance,schema['else'],path)
    if 'const' in schema and instance!=schema['const']: raise SchemaViolation(f'{path}: const mismatch')
    if 'enum' in schema and instance not in schema['enum']: raise SchemaViolation(f'{path}: enum mismatch')
    if 'type' in schema:
        ts=schema['type'] if isinstance(schema['type'],list) else [schema['type']]
        if not any(_type_ok(instance,t) for t in ts): raise SchemaViolation(f'{path}: type mismatch')
    if isinstance(instance,str):
        if len(instance)<schema.get('minLength',0): raise SchemaViolation(f'{path}: minLength')
        if 'maxLength' in schema and len(instance)>schema['maxLength']: raise SchemaViolation(f'{path}: maxLength')
        if 'pattern' in schema and re.search(schema['pattern'],instance) is None: raise SchemaViolation(f'{path}: pattern')
        if schema.get('format')=='date-time':
            try: datetime.fromisoformat(instance.replace('Z','+00:00'))
            except Exception: raise SchemaViolation(f'{path}: date-time format')
    if isinstance(instance,(int,float)) and not isinstance(instance,bool):
        if 'minimum' in schema and instance<schema['minimum']: raise SchemaViolation(f'{path}: minimum')
        if 'maximum' in schema and instance>schema['maximum']: raise SchemaViolation(f'{path}: maximum')
    if isinstance(instance,list):
        if len(instance)<schema.get('minItems',0): raise SchemaViolation(f'{path}: minItems')
        if schema.get('uniqueItems'):
            seen=[]
            for x in instance:
                if x in seen: raise SchemaViolation(f'{path}: uniqueItems')
                seen.append(x)
        if isinstance(schema.get('items'),dict):
            for i,x in enumerate(instance): validate(x,schema['items'],f'{path}[{i}]')
    if isinstance(instance,dict):
        for k in schema.get('required',[]):
            if k not in instance: raise SchemaViolation(f'{path}: missing {k}')
        props=schema.get('properties',{})
        ap=schema.get('additionalProperties')
        extra=set(instance)-set(props)
        if ap is False:
            if extra: raise SchemaViolation(f'{path}: additional properties {sorted(extra)}')
        elif isinstance(ap,dict):
            # schema-form additionalProperties constrains the VALUE of every property not
            # already named in `properties` (e.g. answer-snapshot.schema.json's `answers` map:
            # every key is an arbitrary question id, every value must independently validate as
            # {"type":"boolean"}). Previously only `additionalProperties: false` was enforced,
            # so this schema form was silently a no-op -- any value type passed.
            for k in extra: validate(instance[k],ap,f'{path}.{k}')
        for k,s in props.items():
            if k in instance: validate(instance[k],s,f'{path}.{k}')
    return True
