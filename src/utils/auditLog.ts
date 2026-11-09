import { AuditEvent, AuditOutcome } from '../types/pos';
const KEY='resto_pos_audit_v1', MAX=500;
export function loadAuditEvents():AuditEvent[]{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
export function appendAuditEvent(p:Omit<AuditEvent,'id'|'at'>&{at?:string}):AuditEvent {const e:AuditEvent={...p,id:`aud-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,at:p.at||new Date().toISOString()};try{localStorage.setItem(KEY,JSON.stringify([e,...loadAuditEvents()].slice(0,MAX)))}catch{}return e}
export function auditAllow(action:string,message:string,ctx:Partial<AuditEvent>={}){return appendAuditEvent({action,message,outcome:'allow' as AuditOutcome,...ctx})}
export function auditDeny(action:string,message:string,ctx:Partial<AuditEvent>={}){return appendAuditEvent({action,message,outcome:'deny' as AuditOutcome,...ctx})}
