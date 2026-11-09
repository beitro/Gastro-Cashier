import { StaffAccount, Table, Transaction, AccountStatus, OrderBatch } from '../types/pos';
export const DEFAULT_TENANT_ID='tenant-nusantara';
export const DEFAULT_OUTLET_ID='outlet-nusantara-01';
export const DEFAULT_OUTLET_NAME='Resto Nusantara - Outlet Utama';
export function resolveAccountStatus(s:StaffAccount):AccountStatus { return s.status || (s.isActive===false?'inactive':'active'); }
export function migrateStaff(s:StaffAccount|null):StaffAccount|null { if(!s)return null; const status=resolveAccountStatus(s), outletId=s.outletId||DEFAULT_OUTLET_ID, outletName=s.outletName||DEFAULT_OUTLET_NAME; return {...s,status,isActive:status==='active',outletId,outletName,tenantId:s.tenantId||DEFAULT_TENANT_ID,memberships:s.memberships?.length?s.memberships:[{outletId,outletName,role:s.role,status}]}; }
export function migrateTable(t:Table):Table { return {...t,outletId:t.outletId||DEFAULT_OUTLET_ID,sessionVersion:t.sessionVersion??((t.status==='occupied'||t.status==='billing')?1:0)}; }
export const migrateTables=(ts:Table[]) => (ts||[]).map(migrateTable);
export function migrateTransaction(tx:Transaction):Transaction { const batches:OrderBatch[]=(tx.batches||[]).map(b=>({...b,items:b.items||[]})); const max=batches.reduce((n,b)=>Math.max(n,b.batchNumber||0),0); return {...tx,outletId:tx.outletId||DEFAULT_OUTLET_ID,sessionVersion:tx.sessionVersion??1,batches,allCurrentItems:tx.allCurrentItems||[],nextBatchNumber:tx.nextBatchNumber??max+1}; }
export function migrateTransactions(map:Record<string,Transaction>):Record<string,Transaction> { return Object.fromEntries(Object.entries(map||{}).map(([k,v])=>[k,migrateTransaction(v)])); }
