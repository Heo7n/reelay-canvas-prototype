ALTER TABLE users
  ADD COLUMN contact_email text,
  ADD COLUMN contact_phone text,
  ADD CONSTRAINT users_contact_email_length_check CHECK (
    contact_email IS NULL OR char_length(contact_email) <= 254
  ),
  ADD CONSTRAINT users_contact_phone_length_check CHECK (
    contact_phone IS NULL OR char_length(contact_phone) BETWEEN 5 AND 32
  );
