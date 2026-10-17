/* Pick-lists and logbook targets. Edit these to match your programme. Your own additions (+ Add) are stored on your server. */
window.OPT = {
  // Case types use the ISO 26825 syringe-label colours anaesthetists already read at a glance.
  types: [
    { id: 'theatre', label: 'Theatre', color: 'yellow' },     // induction agents
    { id: 'obstetric', label: 'Obstetric', color: 'grey' },   // local anaesthetics
    { id: 'icu', label: 'ICU', color: 'violet' },             // vasopressors
    { id: 'pain', label: 'Pain', color: 'blue' },             // opioids
    { id: 'procedure', label: 'Procedure', color: 'green' },  // anticholinergics
  ],
  specialties: ['General surgery', 'Orthopaedics', 'Obstetrics', 'Gynaecology', 'Urology', 'ENT', 'Ophthalmology',
    'Maxillofacial', 'Neurosurgery', 'Spine', 'Cardiac', 'Thoracic', 'Vascular', 'Plastics & burns', 'Paediatric surgery',
    'Trauma', 'Endoscopy', 'Interventional radiology', 'Cath lab', 'MRI / CT', 'Dental', 'Other'],
  urgency: ['Elective', 'Urgent', 'Emergency'],
  asa: ['1', '2', '3', '4', '5', '6'],
  gender: ['Male', 'Female'],
  ageUnits: [{ id: 'y', label: 'years' }, { id: 'm', label: 'months' }, { id: 'd', label: 'days' }],
  // "below" is the exclusive upper limit in years; the paediatric board targets rely on these cut-offs.
  ageBands: [
    { id: 'Under 28 days', below: 28 / 365 }, { id: '28 days to 3 months', below: 0.25 }, { id: '3 to 12 months', below: 1 },
    { id: '1 to 2 years', below: 3 }, { id: '3 to 11 years', below: 12 }, { id: '12 to 17 years', below: 18 },
    { id: '18 to 39', below: 40 }, { id: '40 to 64', below: 65 }, { id: '65 to 79', below: 80 }, { id: '80 and over', below: Infinity },
  ],
  bmiBands: [
    { id: 'Under 18.5', below: 18.5 }, { id: '18.5 to 24.9', below: 25 }, { id: '25 to 29.9', below: 30 },
    { id: '30 to 34.9', below: 35 }, { id: '35 to 39.9', below: 40 }, { id: '40 and over', below: Infinity },
  ],
  durationBands: [
    { id: 'Under 30 min', below: 30 }, { id: '30 to 59 min', below: 60 }, { id: '1 to 2 h', below: 120 },
    { id: '2 to 4 h', below: 240 }, { id: 'Over 4 h', below: Infinity },
  ],
  timeOfDay: ['In hours', 'After hours', 'Weekend / holiday'],
  // In-hours window for the time-of-day split. Weekend days: 0 = Sunday ... 6 = Saturday (UAE weekend: Sat, Sun).
  workingHours: { start: '07:30', end: '15:30', weekendDays: [6, 0] },
  supervision: ['Observed', 'Direct', 'Indirect', 'Independent', 'Supervising junior'],
  anaesthesia: ['GA', 'RSI', 'TIVA', 'Inhalational induction', 'Sedation', 'Spinal', 'Epidural', 'CSE', 'Nerve block', 'Local / MAC'],
  airway: ['Facemask', 'SGA', 'ETT', 'DLT', 'Bronchial blocker', 'Tracheostomy', 'HFNO / THRIVE'],
  laryngoscopy: ['Direct', 'Video', 'Awake fibreoptic', 'Asleep fibreoptic', 'Front of neck access'],
  blocks: ['Interscalene', 'Supraclavicular', 'Infraclavicular', 'Axillary', 'Femoral', 'Fascia iliaca', 'Adductor canal',
    'Popliteal sciatic', 'Ankle', 'Erector spinae', 'TAP', 'Rectus sheath', 'Quadratus lumborum', 'Serratus anterior',
    'PECS', 'Paravertebral', 'Scalp', 'Other block'],
  procedures: ['Arterial line', 'CVC (US-guided)', 'PA catheter', 'Cardiac output monitor', 'US-guided IV', 'Intraosseous',
    'TOE', 'Focused TTE', 'Lung ultrasound', 'Gastric ultrasound', 'pEEG / BIS', 'Evoked potentials', 'Bronchoscopy',
    'Percutaneous tracheostomy', 'Chest drain', 'Lumbar puncture', 'Regional catheter', 'Blood patch'],
  categories: ['Cardiac surgery', 'On bypass', 'Major vascular', 'Intrathoracic non-cardiac', 'Intracranial open',
    'Intracranial endovascular', 'Complex life-threatening'],
  obstetric: ['Labour analgesia', 'Caesarean section', 'Other obstetric'],
  icuSupport: ['Invasive ventilation', 'NIV', 'HFNO', 'Vasopressors', 'Inotropes', 'RRT', 'ECMO', 'Prone positioning', 'ICP monitoring'],
  icuDiagnosis: ['Sepsis', 'Respiratory failure', 'Post-operative', 'Trauma', 'Neurological', 'Cardiac', 'Renal / metabolic', 'Obstetric', 'Other'],
  painSetting: ['Acute pain round', 'Chronic pain clinic', 'Cancer pain', 'Interventional procedure'],
  comorbidities: ['Hypertension', 'Type 2 diabetes', 'Type 1 diabetes', 'Ischaemic heart disease', 'Heart failure',
    'AF / arrhythmia', 'Valve disease', 'Pacemaker / ICD', 'Asthma', 'COPD', 'Obstructive sleep apnoea', 'Obesity',
    'CKD', 'On dialysis', 'Liver disease', 'Stroke / TIA', 'Epilepsy', 'Thyroid disease', 'Anaemia', 'Coagulopathy',
    'Sickle cell disease', 'Pregnancy', 'Smoker', 'Frailty', 'Difficult airway history', 'PONV history'],
  // Incidents (the field is called complications in exports for continuity).
  complications: ['None', 'Hypotension needing vasopressor', 'Desaturation below 90%', 'Difficult airway', 'Aspiration',
    'Anaphylaxis', 'LAST', 'Accidental dural puncture', 'Failed regional', 'Laryngospasm', 'Bronchospasm', 'Arrhythmia',
    'Cardiac arrest', 'Drug error', 'Equipment failure', 'Unplanned ICU admission', 'Awareness', 'Other'],

  // Drugs given, grouped as on a drug tray.
  drugs: [
    { group: 'Induction and sedation', items: ['Propofol', 'Ketamine', 'Thiopentone', 'Etomidate', 'Midazolam', 'Dexmedetomidine'] },
    { group: 'Volatiles', items: ['Sevoflurane', 'Desflurane', 'Isoflurane', 'Nitrous oxide'] },
    { group: 'Opioids', items: ['Fentanyl', 'Remifentanil', 'Morphine', 'Sufentanil', 'Pethidine', 'Tramadol'] },
    { group: 'Muscle relaxants and reversal', items: ['Rocuronium', 'Atracurium', 'Cisatracurium', 'Suxamethonium', 'Vecuronium', 'Sugammadex', 'Neostigmine + glycopyrrolate'] },
    { group: 'Vasoactive', items: ['Phenylephrine', 'Ephedrine', 'Noradrenaline', 'Adrenaline', 'Vasopressin', 'Metaraminol', 'Atropine', 'Glycopyrrolate'] },
    { group: 'Local anaesthetics', items: ['Bupivacaine (heavy)', 'Bupivacaine', 'Levobupivacaine', 'Ropivacaine', 'Lidocaine', 'Chloroprocaine'] },
    { group: 'Analgesia', items: ['Paracetamol', 'Ketorolac', 'Parecoxib', 'Diclofenac', 'Magnesium', 'Lidocaine infusion', 'Intrathecal morphine'] },
    { group: 'Antiemetics', items: ['Ondansetron', 'Dexamethasone', 'Granisetron', 'Metoclopramide', 'Droperidol'] },
    { group: 'Other', items: ['Antibiotic prophylaxis', 'Tranexamic acid', 'Oxytocin', 'Carbetocin', 'Insulin', 'Blood products', 'Hydrocortisone'] },
  ],

  // Medications the patient was already on, and what was done with them before surgery.
  regularMeds: ['Aspirin', 'Clopidogrel', 'Ticagrelor', 'Warfarin', 'Apixaban', 'Rivaroxaban', 'Dabigatran', 'LMWH',
    'Metformin', 'SGLT2 inhibitor', 'GLP-1 agonist', 'Sulfonylurea', 'Insulin', 'ACE inhibitor / ARB', 'Beta blocker',
    'Calcium channel blocker', 'Diuretic', 'Statin', 'Steroids', 'Levothyroxine', 'Antiepileptic', 'SSRI / SNRI', 'MAOI',
    'Lithium', 'Antipsychotic', 'Regular opioid', 'Inhalers', 'Immunosuppressant', 'Combined pill / HRT'],
  medActions: ['Continued', 'Omitted on the day', 'Stopped 1 to 2 days before', 'Stopped 3 to 5 days before',
    'Stopped 7 days or more before', 'Bridged with heparin / LMWH', 'Dose reduced', 'Switched to alternative',
    'Variable-rate insulin', 'Stress-dose steroid', 'Restarted after surgery', 'Started new'],
  allergies: ['No known allergies', 'Penicillin', 'Cephalosporin', 'Sulfonamide', 'NSAIDs', 'Opioid', 'Muscle relaxant',
    'Latex', 'Chlorhexidine', 'Iodine / contrast', 'Local anaesthetic', 'Egg / soy', 'Other'],

  rotationKinds: ['Anaesthesia', 'ICU', 'Obstetric', 'Paediatric', 'Cardiac', 'Neuro', 'Thoracic', 'Regional', 'Pain', 'Pre-op clinic', 'Other'],

  // Specialty choices that suggest a board category.
  specialtyCategory: { 'Cardiac': 'Cardiac surgery', 'Thoracic': 'Intrathoracic non-cardiac', 'Vascular': 'Major vascular' },

  // Minimum case numbers - NIHS Emirati Board in Anesthesiology, section IV.C.9.
  targets: [
    { id: 'labour', label: 'Labour analgesia', target: 40 },
    { id: 'caesarean', label: 'Caesarean sections', target: 40 },
    { id: 'paeds12', label: 'Children under 12', target: 100 },
    { id: 'paeds3y', label: 'Children under 3 years', target: 20 },
    { id: 'paeds3m', label: 'Infants under 3 months', target: 5 },
    { id: 'cardiac', label: 'Cardiac surgery', target: 20 },
    { id: 'bypass', label: 'Cardiac on bypass', target: 10 },
    { id: 'vascular', label: 'Major vascular', target: 10 },
    { id: 'thoracic', label: 'Intrathoracic non-cardiac', target: 15 },
    { id: 'intracranial', label: 'Intracranial procedures', target: 20 },
    { id: 'intracranialOpen', label: 'Intracranial, open', target: 10 },
    { id: 'epidural', label: 'Epidurals', target: 40 },
    { id: 'spinal', label: 'Spinals', target: 40 },
    { id: 'complex', label: 'Complex life-threatening', target: 20 },
    { id: 'blocks', label: 'Peripheral nerve blocks', target: 40 },
    { id: 'pain', label: 'Pain patients assessed', target: 20 },
  ],
};
