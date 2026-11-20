/**
 * The certificate fields the renewal page shows, as GET /api/certificates/:id serves
 * them to the holder (the Certificate row; prisma/schema/certification.prisma).
 */
export interface Certificate {
    id: string;
    certificateNumber: string;
    farmName: string;
    holderDisplayName: string | null;
    expiryDate: string;
    status: string;
}
