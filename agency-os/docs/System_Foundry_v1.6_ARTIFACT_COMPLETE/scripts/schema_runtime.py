from __future__ import annotations
import re
from datetime import datetime
class SchemaViolation(ValueError): pass

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
        if schema.get('additionalProperties') is False:
            extra=set(instance)-set(props)
            if extra: raise SchemaViolation(f'{path}: additional properties {sorted(extra)}')
        for k,s in props.items():
            if k in instance: validate(instance[k],s,f'{path}.{k}')
    return True
