import { Models } from 'appwrite';

export interface Student extends Models.Document {
    name: string;
    phone_no: number;
    gender: 'MALE' | 'FEMALE';
    department: 'CSE' | 'MECH' | 'EEE' | 'ECE' | 'CIVIL' | 'PHY' | 'CHEM' | 'MATH';
    year: '1' | '2' | '3' | '4';
    course: 'b.tech' | 'm.tech' | 'bsc' | 'msc';
    is_out: boolean;
    is_on_leave: boolean;
    faceRegistered: boolean;
}

export interface Outing extends Models.Document {
    roll_no: string;
    out_time: string;
    in_time?: string;
}
