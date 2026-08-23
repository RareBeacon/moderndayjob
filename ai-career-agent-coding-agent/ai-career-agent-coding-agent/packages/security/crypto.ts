import crypto from 'node:crypto';import {env} from '../../lib/env';
const key=crypto.createHash('sha256').update(env.ENCRYPTION_MASTER_KEY).digest();
export function encryptSecret(value:string){const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([c.update(value,'utf8'),c.final()]);return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`}
export function decryptSecret(payload:string){const [ivS,tagS,dataS]=payload.split('.');const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(ivS,'base64'));d.setAuthTag(Buffer.from(tagS,'base64'));return Buffer.concat([d.update(Buffer.from(dataS,'base64')),d.final()]).toString('utf8')}
