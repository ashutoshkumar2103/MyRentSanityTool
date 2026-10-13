import { QuotationPage } from '../pages/QuotationPage';
import {
  TEST_CAR_CLASS,
  TEST_CUSTOMER,
  TEST_DRIVER1,
  TEST_PAYMENT,
  TEST_QUOTATION_PICKUP,
  TEST_QUOTATION_RETURN,
  TEST_RESERVATION_SOURCE,
} from './testData';

/**
 * Fills Customer, Driver1, Reservation Source, and Payment — the fields every
 * Quotation needs regardless of how Car Class/Pick Up/Return got set. Reused
 * by the calendar-originated Quotation flow, where those three are already
 * pre-filled from the vehicle/date picked on the calendar.
 */
export async function fillCustomerAndPaymentDetails(quotationPage: QuotationPage) {
  await quotationPage.selectCustomer(TEST_CUSTOMER.searchTerm, TEST_CUSTOMER.option);
  await quotationPage.selectDriver1(TEST_DRIVER1.searchTerm, TEST_DRIVER1.option);
  await quotationPage.selectReservationSource(TEST_RESERVATION_SOURCE.option);
  await quotationPage.selectPayment(TEST_PAYMENT);
}

export async function fillStandardQuotationDetails(quotationPage: QuotationPage) {
  await quotationPage.selectCustomer(TEST_CUSTOMER.searchTerm, TEST_CUSTOMER.option);
  await quotationPage.selectDriver1(TEST_DRIVER1.searchTerm, TEST_DRIVER1.option);
  // Order matters here — see the note on QuotationPage.selectReservationSource().
  await quotationPage.selectCarClass(TEST_CAR_CLASS);
  // Pick Up's own list is branch-restricted (just this one office) — see the
  // notes in testData.ts. Return's list is the full location book.
  await quotationPage.selectPickupLocation(TEST_QUOTATION_PICKUP.searchTerm, TEST_QUOTATION_PICKUP.option);
  await quotationPage.selectReturnLocation(TEST_QUOTATION_RETURN.searchTerm, TEST_QUOTATION_RETURN.option);
  await quotationPage.selectReservationSource(TEST_RESERVATION_SOURCE.option);
  await quotationPage.selectPayment(TEST_PAYMENT);
}
