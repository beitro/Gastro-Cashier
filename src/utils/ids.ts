import { OrderBatch } from '../types/pos';
export function nextBatchNumber(batches:OrderBatch[]):number { return batches?.length?Math.max(...batches.map(b=>b.batchNumber||0))+1:1; }
export function nextTransactionId(outletId?:string):string { const ts=Date.now().toString(36).toUpperCase(), rand=Math.random().toString(36).slice(2,10).toUpperCase(), prefix=outletId?outletId.replace(/[^a-z0-9]/gi,'').slice(-4).toUpperCase():'TX'; return `TRX-${prefix}-${ts}-${rand}`; }
