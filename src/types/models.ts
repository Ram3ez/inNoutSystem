import { Models } from 'appwrite';

/**
 * Data Models and TypeScript Interfaces
 * Defines the structure of documents stored in Appwrite collections.
 */

/**
 * Student Profile Document
 */
export interface Student extends Models.Document {
    name: string;
    phone_no: number;
    gender: 'MALE' | 'FEMALE';
    department: 'CSE' | 'MECH' | 'EEE' | 'ECE' | 'CIVIL' | 'PHY' | 'CHEM' | 'MATH';
    year: '1' | '2' | '3' | '4';
    course: 'b.tech' | 'm.tech' | 'bsc' | 'msc';
    is_out: boolean; // True if student is currently on a short outing
    is_on_leave: boolean; // True if student is on an approved long leave
    faceRegistered: boolean; // Legacy Face-API status
    ghostface_registered?: boolean; // GhostFaceNet status
    edgeface_registered?: boolean; // EdgeFace status
    parent_name?: string;
    parent_phone?: number;
    parent_email?: string;
    pending_parent_name?: string;
    pending_parent_phone?: number;
    pending_parent_email?: string;
    parent_verification_status?: 'unverified' | 'verified' | 'pending_approval' | 'rejected';
    outing_blocked_until?: string; // ISO string for automated restriction
}

/**
 * Outing Record Document
 * Tracks entry/exit timestamps for short outings.
 */
export interface Outing extends Models.Document {
    roll_no: string;
    out_time: string; // ISO string
    in_time?: string; // ISO string (null if still out)
}

