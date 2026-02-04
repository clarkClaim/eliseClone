# openmrs-adapter Specification

## Purpose

Concrete MRS adapter implementation for OpenMRS REST API. Handles OpenMRS-specific authentication, endpoints, and data mapping.

## ADDED Requirements

### Requirement: OpenMRS adapter implements MRS adapter interface

The OpenMRS adapter SHALL implement all methods defined in the MRS adapter interface.

#### Scenario: Adapter instantiation

- **WHEN** OpenMRSAdapter is instantiated
- **THEN** it implements MRSAdapter interface
- **AND** reads OPENMRS_URL, OPENMRS_USER, OPENMRS_PASSWORD from environment

---

### Requirement: OpenMRS adapter uses REST API

The adapter SHALL communicate with OpenMRS via its REST API.

#### Scenario: API base URL configuration

- **WHEN** the adapter makes API calls
- **THEN** it uses `${OPENMRS_URL}/ws/rest/v1` as the base URL

#### Scenario: API request headers

- **WHEN** making authenticated requests
- **THEN** the adapter includes Basic Auth header with encoded credentials
- **AND** includes Content-Type: application/json for POST/PUT requests

---

### Requirement: OpenMRS adapter fetches patients

The adapter SHALL fetch patient data from OpenMRS patient endpoint.

#### Scenario: Get patient by UUID

- **WHEN** `getPatient(uuid)` is called
- **THEN** the adapter calls `GET /patient/{uuid}?v=full`
- **AND** maps OpenMRS person fields to canonical Patient type

#### Scenario: Search patients

- **WHEN** `searchPatients(query)` is called with name
- **THEN** the adapter calls `GET /patient?q={query}&v=default`
- **AND** returns mapped Patient array

---

### Requirement: OpenMRS adapter fetches providers

The adapter SHALL fetch provider data from OpenMRS provider endpoint.

#### Scenario: Get provider by UUID

- **WHEN** `getProvider(uuid)` is called
- **THEN** the adapter calls `GET /provider/{uuid}?v=full`
- **AND** maps OpenMRS provider fields to canonical Provider type

#### Scenario: List providers

- **WHEN** `getProviders()` is called
- **THEN** the adapter calls `GET /provider?v=default`
- **AND** returns mapped Provider array

---

### Requirement: OpenMRS adapter manages appointments

The adapter SHALL create and retrieve appointments via OpenMRS appointment module.

#### Scenario: Get appointments by date range

- **WHEN** `getAppointments(filter)` is called
- **THEN** the adapter calls the OpenMRS appointment endpoint with date parameters
- **AND** filters by provider/patient if specified in filter

#### Scenario: Create appointment

- **WHEN** `createAppointment(appointment)` is called
- **THEN** the adapter POSTs to OpenMRS appointment endpoint
- **AND** returns created appointment with OpenMRS UUID as mrsId

#### Scenario: Cancel appointment

- **WHEN** `cancelAppointment(mrsId, reason)` is called
- **THEN** the adapter updates appointment status to CANCELLED in OpenMRS
- **AND** includes cancellation reason in the request

---

### Requirement: OpenMRS adapter handles errors gracefully

The adapter SHALL handle OpenMRS-specific error responses.

#### Scenario: 404 Not Found

- **WHEN** OpenMRS returns 404 for a resource
- **THEN** the adapter returns null (for get operations) or throws NotFoundError

#### Scenario: 401 Unauthorized

- **WHEN** OpenMRS returns 401
- **THEN** the adapter throws AuthenticationError
- **AND** includes message about checking credentials

#### Scenario: 500 Server Error

- **WHEN** OpenMRS returns 5xx error
- **THEN** the adapter throws MRSError with status code and message
- **AND** the error is retryable

---

### Requirement: OpenMRS adapter implements timeout and retry

The adapter SHALL have configurable timeout and retry behavior.

#### Scenario: Request timeout

- **WHEN** a request exceeds the configured timeout (default 10 seconds)
- **THEN** the adapter aborts the request
- **AND** throws TimeoutError

#### Scenario: Retry on transient failure

- **WHEN** a request fails with network error or 5xx status
- **THEN** the adapter retries up to 3 times with exponential backoff
- **AND** throws after final retry fails
