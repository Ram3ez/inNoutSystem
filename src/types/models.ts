import { Models } from 'appwrite';

/**
 * Data Models and TypeScript Interfaces
 * Defines the structure of documents stored in Appwrite collections.
 */

/**
 * Student Profile Document
 * Extends the default Appwrite Models.Document to include student-specific fields.
 */
export interface Student extends Models.Document {
    /** Full name of the student. */
    name: string;
    /** Primary contact number for the student. */
    phone_no: number;
    /** Biological gender of the student, used for automated outing restrictions (e.g. curfew times). */
    gender: 'MALE' | 'FEMALE';
    /** Academic department. */
    department: 'CSE' | 'MECH' | 'EEE' | 'ECE' | 'CIVIL' | 'PHY' | 'CHEM' | 'MATH';
    /** Current year of study. */
    year: '1' | '2' | '3' | '4';
    /** Academic program enrolled in. */
    course: 'b.tech' | 'm.tech' | 'bsc' | 'msc';
    /** True if the student is currently outside the hostel on a short-term outing. */
    is_out: boolean; 
    /** True if the student is currently outside the hostel on an approved long-term leave. */
    is_on_leave: boolean; 

    /** GhostFaceNet ONNX model registration status. High-precision vector. */
    ghostface_registered?: boolean; 
    /** EdgeFace ONNX model registration status. Optimized lightweight vector. */
    edgeface_registered?: boolean; 
    /** Verified parent/guardian name for official communications. */
    parent_name?: string;
    /** Verified parent/guardian contact number. */
    parent_phone?: number;
    /** Verified parent/guardian email address used for leave notifications. */
    parent_email?: string;
    /** Unverified parent/guardian name submitted by the student, pending faculty approval. */
    pending_parent_name?: string;
    /** Unverified parent/guardian contact number submitted by the student. */
    pending_parent_phone?: number;
    /** Unverified parent/guardian email submitted by the student. */
    pending_parent_email?: string;
    /** Current state of the parent detail verification workflow. */
    parent_verification_status?: 'unverified' | 'verified' | 'pending_approval' | 'rejected';
    /** ISO date string representing the date until which the student is administratively blocked from taking outings. */
    outing_blocked_until?: string; 
}

/**
 * Outing Record Document
 * Tracks entry/exit timestamps for short campus outings.
 * Stored in the `outing` collection when active, and moved to `outing_archive` when complete.
 */
export interface Outing extends Models.Document {
    /** The roll number of the student taking the outing. */
    roll_no: string;
    /** ISO 8601 string representing the exact departure timestamp. */
    out_time: string; 
    /** ISO 8601 string representing the return timestamp. Null if the student has not yet returned. */
    in_time?: string; 
}

