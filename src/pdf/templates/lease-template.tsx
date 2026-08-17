import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { LeasePdfPayload } from '@/contracts/contracts.service';

// 1. Définition des styles (Uniquement du Flexbox et des propriétés basiques)
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 12,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: 'center',
    color: '#2c3e50',
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 10,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  value: {
    fontSize: 12,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottom: '1px solid #eee',
  },
  row: {
    flexDirection: 'row', // Équivalent de display: flex; flex-direction: row;
    justifyContent: 'space-between',
    marginBottom: 10,
  },
});

// 2. Le composant React (Ce n'est PAS un composant Next.js, c'est purement pour le PDF)
interface TemplateProps {
  data: LeasePdfPayload;
}

export const LeaseTemplate: React.FC<TemplateProps> = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>CONTRAT DE LOCATION : {data.reference}</Text>

      <View style={styles.section}>
        <Text style={styles.label}>PROPRIÉTAIRE (Bailleur)</Text>
        <Text style={styles.value}>{data.ownerFullName}</Text>
        <Text style={styles.value}>{data.ownerAddress || 'Adresse non renseignée'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>LOCATAIRE (Preneur)</Text>
        <Text style={styles.value}>{data.tenantFullName}</Text>
        <Text style={styles.value}>Né(e) le : {data.tenantBirthDate || 'Non renseigné'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>DÉSIGNATION DES LIEUX</Text>
        <Text style={styles.value}>{data.designation}</Text>
        <Text style={styles.value}>{data.address}</Text>
      </View>

      <View style={styles.section}>
        <Text style={{ fontSize: 14, marginBottom: 10, fontWeight: 'bold' }}>CONDITIONS FINANCIÈRES</Text>

        <View style={styles.row}>
          <Text>Loyer mensuel :</Text>
          <Text>{data.rentAmount.toFixed(2)} €</Text>
        </View>

        <View style={styles.row}>
          <Text>Charges mensuelles :</Text>
          <Text>{data.chargesAmount.toFixed(2)} €</Text>
        </View>

        <View style={[styles.row, { fontWeight: 'bold' }]}>
          <Text>Total mensuel :</Text>
          <Text>{(data.rentAmount + data.chargesAmount).toFixed(2)} €</Text>
        </View>

        <View style={styles.row}>
          <Text>Dépôt de garantie :</Text>
          <Text>{data.depositAmount.toFixed(2)} €</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>DURÉE DU BAIL</Text>
        <Text style={styles.value}>Début : {data.startDate}</Text>
        {data.endDate && <Text style={styles.value}>Fin : {data.endDate}</Text>}
      </View>

    </Page>
  </Document>
);