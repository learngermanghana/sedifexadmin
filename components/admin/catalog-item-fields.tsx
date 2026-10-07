"use client";

import { useState } from 'react';

type ItemFormType = 'product' | 'service' | 'made_to_order' | 'course' | 'tour_package' | 'digital_item';
type ServiceKind = 'consultation' | 'quote_request' | 'tour_package';
type CourseMode = 'online' | 'in_person' | 'hybrid';

type TourItineraryDay = {
  day: number;
  title: string;
  description: string;
};

export type CatalogItemEditorDefaults = {
  name: string;
  storeId: string;
  itemType: ItemFormType;
  category: string;
  subcategory: string;
  price: string;
  currency: string;
  description: string;
  imageUrl: string;
  imageUrls: string[];
  websiteVisible: boolean;
  sku: string;
  brand: string;
  costPrice: string;
  openingStock: string;
  reorderPoint: string;
  expiryDate: string;
  serviceKind: ServiceKind;
  durationMinutes: string;
  location: string;
  destination: string;
  tourStyle: string;
  durationDays: string;
  durationNights: string;
  startingCity: string;
  endingCity: string;
  capacity: string;
  shortSummary: string;
  itinerary: TourItineraryDay[];
  inclusions: string[];
  exclusions: string[];
  allowDepositPayment: boolean;
  depositAmount: string;
  branch: string;
  preferredTimes: string;
  startDate: string;
  registrationFee: string;
  fullFee: string;
  duration: string;
  courseLevel: string;
  courseMode: CourseMode;
  requirements: string;
  starterItems: string;
  certificateIncluded: boolean;
  Agreement: string;
};

function Field({
  label,
  name,
  id,
  defaultValue = '',
  placeholder,
  type = 'text',
  min,
  step,
  required = false,
}: {
  label: string;
  name: string;
  id: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        step={step}
        required={required}
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
      />
    </div>
  );
}

function TextArea({
  label,
  name,
  id,
  defaultValue = '',
  placeholder,
  rows = 3,
}: {
  label: string;
  name: string;
  id: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={id}>{label}</label>
      <textarea
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
      />
    </div>
  );
}

export function CatalogItemFields({
  defaults,
  fieldIdPrefix,
}: {
  defaults: CatalogItemEditorDefaults;
  fieldIdPrefix: string;
}) {
  const [itemType, setItemType] = useState<ItemFormType>(defaults.itemType);
  const [serviceKind, setServiceKind] = useState<ServiceKind>(
    defaults.itemType === 'tour_package' ? 'tour_package' : defaults.serviceKind,
  );
  const [currency, setCurrency] = useState(defaults.currency === 'USD' ? 'USD' : 'GHS');
  const [allowDepositPayment, setAllowDepositPayment] = useState(defaults.allowDepositPayment);
  const [itinerary, setItinerary] = useState<TourItineraryDay[]>(
    defaults.itinerary.length > 0 ? defaults.itinerary : [{ day: 1, title: '', description: '' }],
  );
  const [inclusions, setInclusions] = useState<string[]>(defaults.inclusions.length > 0 ? defaults.inclusions : ['']);
  const [exclusions, setExclusions] = useState<string[]>(defaults.exclusions.length > 0 ? defaults.exclusions : ['']);

  const isTourPackage = itemType === 'tour_package' || serviceKind === 'tour_package';
  const isService = itemType === 'service' || itemType === 'made_to_order';
  const isCourse = itemType === 'course';
  const behavesLikeService = isService || isCourse || isTourPackage;

  const id = (name: string) => `${fieldIdPrefix}-${name}`;

  function chooseItemType(next: ItemFormType) {
    setItemType(next);
    if (next === 'tour_package') {
      setServiceKind('tour_package');
    } else if (serviceKind === 'tour_package') {
      setServiceKind('consultation');
    }
  }

  function chooseServiceKind(next: ServiceKind) {
    setServiceKind(next);
    if (next === 'tour_package') {
      setItemType('tour_package');
    }
  }

  function updateItinerary(index: number, field: 'title' | 'description', value: string) {
    setItinerary((current) => current.map((day, dayIndex) => (
      dayIndex === index ? { ...day, [field]: value, day: dayIndex + 1 } : day
    )));
  }

  function removeItinerary(index: number) {
    setItinerary((current) => {
      const next = current.filter((_, dayIndex) => dayIndex !== index);
      return (next.length > 0 ? next : [{ day: 1, title: '', description: '' }]).map((day, dayIndex) => ({ ...day, day: dayIndex + 1 }));
    });
  }

  function updateList(kind: 'inclusions' | 'exclusions', index: number, value: string) {
    const setter = kind === 'inclusions' ? setInclusions : setExclusions;
    setter((current) => current.map((entry, entryIndex) => entryIndex === index ? value : entry));
  }

  function removeList(kind: 'inclusions' | 'exclusions', index: number) {
    const setter = kind === 'inclusions' ? setInclusions : setExclusions;
    setter((current) => {
      const next = current.filter((_, entryIndex) => entryIndex !== index);
      return next.length > 0 ? next : [''];
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Name" name="name" id={id('name')} defaultValue={defaults.name} placeholder="Item name" required />
        <Field label="Store ID" name="storeId" id={id('store-id')} defaultValue={defaults.storeId} placeholder="Store ID" required />
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={id('type')}>Item type</label>
          <select
            id={id('type')}
            name="itemType"
            value={itemType}
            onChange={(event) => chooseItemType(event.target.value as ItemFormType)}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
          >
            <option value="product">Product</option>
            <option value="service">Service</option>
            <option value="made_to_order">Booking</option>
            <option value="course">Course</option>
            <option value="tour_package">Tour package</option>
            {defaults.itemType === 'digital_item' ? <option value="digital_item">Digital Item (legacy)</option> : null}
          </select>
        </div>

        <Field label="Category" name="category" id={id('category')} defaultValue={defaults.category} placeholder={isTourPackage ? 'Travel & Tours' : isCourse ? 'Education' : isService ? 'General Services' : 'General Products'} />
        <Field label="Subcategory" name="subcategory" id={id('subcategory')} defaultValue={defaults.subcategory} placeholder="Optional subcategory" />

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={id('currency')}>{isCourse ? 'Fee' : isTourPackage ? 'Starting price' : isService ? 'Price' : 'Selling price'}</label>
          <div className="grid grid-cols-[130px_1fr] gap-2">
            <select
              id={id('currency')}
              name="currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value === 'USD' ? 'USD' : 'GHS')}
              className="rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-950 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
            >
              <option value="GHS">GHS — Ghana cedi</option>
              <option value="USD">USD — US dollar</option>
            </select>
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              defaultValue={defaults.price}
              required
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
            />
          </div>
        </div>
      </div>

      {isService ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-bold text-slate-950">Service details</h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">Matches the service fields used in Sedifex. Choosing Tour package switches to the tour editor.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={id('service-kind')}>Service kind</label>
              <select
                id={id('service-kind')}
                name="serviceKind"
                value={serviceKind}
                onChange={(event) => chooseServiceKind(event.target.value as ServiceKind)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
              >
                <option value="consultation">Consultation / appointment</option>
                <option value="quote_request">Request quote</option>
                <option value="tour_package">Tour package</option>
              </select>
            </div>
            <Field label="Duration minutes" name="durationMinutes" id={id('service-duration')} defaultValue={defaults.durationMinutes} type="number" min="0" step="1" />
            <Field label="Branch / location" name="location" id={id('service-location')} defaultValue={defaults.location} />
          </div>
        </section>
      ) : (
        <input type="hidden" name="serviceKind" value={isTourPackage ? 'tour_package' : defaults.serviceKind} />
      )}

      {isTourPackage ? (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
          <h4 className="text-sm font-bold text-slate-950">Tour details</h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">Same tour-package fields used by Sedifex. Specific trip dates remain separate departures.</p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Field label="Destination" name="destination" id={id('tour-destination')} defaultValue={defaults.destination} placeholder="e.g. Japan" required />
            <Field label="Tour style" name="tourStyle" id={id('tour-style')} defaultValue={defaults.tourStyle} placeholder="e.g. Leisure & Culture" />
            <Field label="Duration days" name="durationDays" id={id('tour-days')} defaultValue={defaults.durationDays} type="number" min="1" step="1" required />
            <Field label="Duration nights" name="durationNights" id={id('tour-nights')} defaultValue={defaults.durationNights} type="number" min="0" step="1" />
            <Field label="Starting city" name="startingCity" id={id('tour-start-city')} defaultValue={defaults.startingCity} placeholder="e.g. Tokyo" />
            <Field label="Ending city" name="endingCity" id={id('tour-end-city')} defaultValue={defaults.endingCity} placeholder="e.g. Osaka" />
            <Field label="Maximum travellers" name="capacity" id={id('tour-capacity')} defaultValue={defaults.capacity} type="number" min="1" step="1" />
          </div>

          <div className="mt-3">
            <TextArea label="Short summary" name="shortSummary" id={id('tour-summary')} defaultValue={defaults.shortSummary} placeholder="A short website-friendly summary of the tour." />
          </div>

          <div className="mt-4 rounded-2xl border border-indigo-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-sm font-bold text-slate-900">Day-by-day itinerary</h5>
              <button
                type="button"
                onClick={() => setItinerary((current) => [...current, { day: current.length + 1, title: '', description: '' }])}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                + Add day
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {itinerary.map((day, index) => (
                <div key={index} className="grid gap-3 rounded-2xl bg-slate-50 p-3 md:grid-cols-[80px_1fr_1.4fr_auto] md:items-end">
                  <div className="pb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Day {index + 1}</div>
                  <input type="hidden" name="itineraryDay" value={index + 1} />
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={id(`itinerary-${index}-title`)}>Title</label>
                    <input
                      id={id(`itinerary-${index}-title`)}
                      name="itineraryTitle"
                      value={day.title}
                      onChange={(event) => updateItinerary(index, 'title', event.target.value)}
                      placeholder="e.g. Tokyo Arrival"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={id(`itinerary-${index}-description`)}>Details</label>
                    <textarea
                      id={id(`itinerary-${index}-description`)}
                      name="itineraryDescription"
                      value={day.description}
                      onChange={(event) => updateItinerary(index, 'description', event.target.value)}
                      placeholder="Airport transfer, hotel check-in, activities…"
                      rows={2}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>
                  <button type="button" onClick={() => removeItinerary(index)} className="mb-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white">Remove</button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {([
              ['inclusions', inclusions, 'What\'s included', 'e.g. 5 nights accommodation'],
              ['exclusions', exclusions, 'What\'s not included', 'e.g. International flights'],
            ] as const).map(([kind, values, label, placeholder]) => (
              <div key={kind} className="rounded-2xl border border-indigo-100 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-sm font-bold text-slate-900">{label}</h5>
                  <button
                    type="button"
                    onClick={() => kind === 'inclusions' ? setInclusions((current) => [...current, '']) : setExclusions((current) => [...current, ''])}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    + Add
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {values.map((entry, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        name={kind}
                        value={entry}
                        onChange={(event) => updateList(kind, index, event.target.value)}
                        placeholder={placeholder}
                        className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
                      />
                      <button type="button" onClick={() => removeList(kind, index)} className="rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 md:items-end">
            <label className="flex items-center gap-2 rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="allowDepositPayment"
                checked={allowDepositPayment}
                onChange={(event) => setAllowDepositPayment(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Allow deposit payment
            </label>
            {allowDepositPayment ? <Field label={`Deposit amount (${currency})`} name="depositAmount" id={id('tour-deposit')} defaultValue={defaults.depositAmount} type="number" min="0" step="0.01" /> : null}
          </div>
        </section>
      ) : null}

      {isCourse ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-bold text-slate-950">Course / programme details</h4>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Field label="Branch" name="branch" id={id('course-branch')} defaultValue={defaults.branch} placeholder="e.g. Accra campus or Online" />
            <Field label="Preferred times" name="preferredTimes" id={id('course-times')} defaultValue={defaults.preferredTimes} placeholder="e.g. Weekdays 6pm" />
            <Field label="Start date" name="startDate" id={id('course-start-date')} defaultValue={defaults.startDate} type="date" />
            <Field label="Registration fee" name="registrationFee" id={id('course-reg-fee')} defaultValue={defaults.registrationFee} type="number" min="0" step="0.01" />
            <Field label="Full fee" name="fullFee" id={id('course-full-fee')} defaultValue={defaults.fullFee} type="number" min="0" step="0.01" placeholder="Defaults to Fee when blank" />
            <Field label="Duration" name="duration" id={id('course-duration')} defaultValue={defaults.duration} placeholder="e.g. 8 weeks" />
            <Field label="Capacity" name="capacity" id={id('course-capacity')} defaultValue={defaults.capacity} type="number" min="0" step="1" />
            <Field label="Course level" name="courseLevel" id={id('course-level')} defaultValue={defaults.courseLevel} />
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor={id('course-mode')}>Mode</label>
              <select id={id('course-mode')} name="courseMode" defaultValue={defaults.courseMode} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10">
                <option value="online">Online</option>
                <option value="in_person">In person</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <TextArea label="Requirements" name="requirements" id={id('course-requirements')} defaultValue={defaults.requirements} />
            <TextArea label="Starter items" name="starterItems" id={id('course-starter-items')} defaultValue={defaults.starterItems} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[220px_1fr] lg:items-start">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" name="certificateIncluded" defaultChecked={defaults.certificateIncluded} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
              Certificate included
            </label>
            <TextArea label="Agreement" name="Agreement" id={id('course-agreement')} defaultValue={defaults.Agreement} />
          </div>
        </section>
      ) : null}

      {!behavesLikeService ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-bold text-slate-950">Product inventory details</h4>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Field label="SKU / Barcode" name="sku" id={id('sku')} defaultValue={defaults.sku} />
            <Field label="Brand" name="brand" id={id('brand')} defaultValue={defaults.brand} placeholder="e.g. Nike, Samsung, Local label" />
            <Field label="Cost price" name="costPrice" id={id('cost-price')} defaultValue={defaults.costPrice} type="number" min="0" step="0.01" />
            <Field label="Opening / current stock" name="openingStock" id={id('opening-stock')} defaultValue={defaults.openingStock} type="number" min="0" step="1" />
            <Field label="Reorder point" name="reorderPoint" id={id('reorder-point')} defaultValue={defaults.reorderPoint} type="number" min="0" step="1" />
            <Field label="Expiry date" name="expiryDate" id={id('expiry-date')} defaultValue={defaults.expiryDate} type="date" />
          </div>
        </section>
      ) : null}

      <div className="grid gap-3">
        <TextArea label={behavesLikeService ? 'Description' : 'Product description'} name="description" id={id('description')} defaultValue={defaults.description} rows={4} />
        <Field label="Cover image URL" name="imageUrl" id={id('image-url')} defaultValue={defaults.imageUrl} placeholder="https://..." type="url" />
        <TextArea label="Photos" name="imageUrls" id={id('image-urls')} defaultValue={defaults.imageUrls.join('\n')} placeholder="One image URL per line" rows={3} />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="websiteVisible" defaultChecked={defaults.websiteVisible} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
        Show on your website
      </label>
    </div>
  );
}
