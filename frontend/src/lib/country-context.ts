// PLOS — Country Context helper for locale-aware modules (Legal, Shopping, etc.)
// Uses a shared in-memory subscribable store so ALL consumers stay in sync
// after a country switch — plus AsyncStorage for persistence and profile
// address inference on first launch. Full ISO 3166-1 country list (~195).
import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  jurisdiction: string;
  currency: string;
  symbol: string;
}

// Curated jurisdiction descriptions for the 8 primary markets
const JURISDICTION_OVERRIDES: Record<string, string> = {
  US: "US federal law + Georgia state law",
  PH: "Philippine civil law (Republic Acts)",
  BE: "Belgian civil law + EU regulations",
  GB: "English common law",
  CA: "Canadian federal + provincial law",
  AU: "Australian federal + state law",
  DE: "German civil law + EU regulations",
  FR: "French civil code + EU regulations",
};

const _RAW_COUNTRIES: Array<Omit<CountryOption, "jurisdiction"> & { jurisdiction?: string }> = [
  { code: "AF", name: 'Afghanistan', flag: "🇦🇫", currency: "AFN", symbol: '؋', jurisdiction: "Afghanistan national law" },
  { code: "AL", name: 'Albania', flag: "🇦🇱", currency: "ALL", symbol: 'L', jurisdiction: "Albania national law" },
  { code: "DZ", name: 'Algeria', flag: "🇩🇿", currency: "DZD", symbol: 'DA', jurisdiction: "Algeria national law" },
  { code: "AD", name: 'Andorra', flag: "🇦🇩", currency: "EUR", symbol: '€', jurisdiction: "Andorra national law" },
  { code: "AO", name: 'Angola', flag: "🇦🇴", currency: "AOA", symbol: 'Kz', jurisdiction: "Angola national law" },
  { code: "AG", name: 'Antigua and Barbuda', flag: "🇦🇬", currency: "XCD", symbol: 'EC$', jurisdiction: "Antigua and Barbuda national law" },
  { code: "AR", name: 'Argentina', flag: "🇦🇷", currency: "ARS", symbol: '$', jurisdiction: "Argentina national law" },
  { code: "AM", name: 'Armenia', flag: "🇦🇲", currency: "AMD", symbol: '֏', jurisdiction: "Armenia national law" },
  { code: "AU", name: 'Australia', flag: "🇦🇺", currency: "AUD", symbol: 'A$', jurisdiction: "Australia national law" },
  { code: "AT", name: 'Austria', flag: "🇦🇹", currency: "EUR", symbol: '€', jurisdiction: "Austria national law" },
  { code: "AZ", name: 'Azerbaijan', flag: "🇦🇿", currency: "AZN", symbol: '₼', jurisdiction: "Azerbaijan national law" },
  { code: "BS", name: 'Bahamas', flag: "🇧🇸", currency: "BSD", symbol: 'B$', jurisdiction: "Bahamas national law" },
  { code: "BH", name: 'Bahrain', flag: "🇧🇭", currency: "BHD", symbol: '.د.ب', jurisdiction: "Bahrain national law" },
  { code: "BD", name: 'Bangladesh', flag: "🇧🇩", currency: "BDT", symbol: '৳', jurisdiction: "Bangladesh national law" },
  { code: "BB", name: 'Barbados', flag: "🇧🇧", currency: "BBD", symbol: 'Bds$', jurisdiction: "Barbados national law" },
  { code: "BY", name: 'Belarus', flag: "🇧🇾", currency: "BYN", symbol: 'Br', jurisdiction: "Belarus national law" },
  { code: "BE", name: 'Belgium', flag: "🇧🇪", currency: "EUR", symbol: '€', jurisdiction: "Belgium national law" },
  { code: "BZ", name: 'Belize', flag: "🇧🇿", currency: "BZD", symbol: 'BZ$', jurisdiction: "Belize national law" },
  { code: "BJ", name: 'Benin', flag: "🇧🇯", currency: "XOF", symbol: 'CFA', jurisdiction: "Benin national law" },
  { code: "BT", name: 'Bhutan', flag: "🇧🇹", currency: "BTN", symbol: 'Nu.', jurisdiction: "Bhutan national law" },
  { code: "BO", name: 'Bolivia', flag: "🇧🇴", currency: "BOB", symbol: 'Bs.', jurisdiction: "Bolivia national law" },
  { code: "BA", name: 'Bosnia and Herzegovina', flag: "🇧🇦", currency: "BAM", symbol: 'KM', jurisdiction: "Bosnia and Herzegovina national law" },
  { code: "BW", name: 'Botswana', flag: "🇧🇼", currency: "BWP", symbol: 'P', jurisdiction: "Botswana national law" },
  { code: "BR", name: 'Brazil', flag: "🇧🇷", currency: "BRL", symbol: 'R$', jurisdiction: "Brazil national law" },
  { code: "BN", name: 'Brunei', flag: "🇧🇳", currency: "BND", symbol: 'B$', jurisdiction: "Brunei national law" },
  { code: "BG", name: 'Bulgaria', flag: "🇧🇬", currency: "BGN", symbol: 'лв', jurisdiction: "Bulgaria national law" },
  { code: "BF", name: 'Burkina Faso', flag: "🇧🇫", currency: "XOF", symbol: 'CFA', jurisdiction: "Burkina Faso national law" },
  { code: "BI", name: 'Burundi', flag: "🇧🇮", currency: "BIF", symbol: 'FBu', jurisdiction: "Burundi national law" },
  { code: "KH", name: 'Cambodia', flag: "🇰🇭", currency: "KHR", symbol: '៛', jurisdiction: "Cambodia national law" },
  { code: "CM", name: 'Cameroon', flag: "🇨🇲", currency: "XAF", symbol: 'FCFA', jurisdiction: "Cameroon national law" },
  { code: "CA", name: 'Canada', flag: "🇨🇦", currency: "CAD", symbol: 'C$', jurisdiction: "Canada national law" },
  { code: "CV", name: 'Cape Verde', flag: "🇨🇻", currency: "CVE", symbol: 'Esc', jurisdiction: "Cape Verde national law" },
  { code: "CF", name: 'Central African Republic', flag: "🇨🇫", currency: "XAF", symbol: 'FCFA', jurisdiction: "Central African Republic national law" },
  { code: "TD", name: 'Chad', flag: "🇹🇩", currency: "XAF", symbol: 'FCFA', jurisdiction: "Chad national law" },
  { code: "CL", name: 'Chile', flag: "🇨🇱", currency: "CLP", symbol: 'CLP$', jurisdiction: "Chile national law" },
  { code: "CN", name: 'China', flag: "🇨🇳", currency: "CNY", symbol: '¥', jurisdiction: "China national law" },
  { code: "CO", name: 'Colombia', flag: "🇨🇴", currency: "COP", symbol: 'COL$', jurisdiction: "Colombia national law" },
  { code: "KM", name: 'Comoros', flag: "🇰🇲", currency: "KMF", symbol: 'CF', jurisdiction: "Comoros national law" },
  { code: "CG", name: 'Congo', flag: "🇨🇬", currency: "XAF", symbol: 'FCFA', jurisdiction: "Congo national law" },
  { code: "CD", name: 'Congo (DRC)', flag: "🇨🇩", currency: "CDF", symbol: 'FC', jurisdiction: "Congo (DRC) national law" },
  { code: "CR", name: 'Costa Rica', flag: "🇨🇷", currency: "CRC", symbol: '₡', jurisdiction: "Costa Rica national law" },
  { code: "HR", name: 'Croatia', flag: "🇭🇷", currency: "EUR", symbol: '€', jurisdiction: "Croatia national law" },
  { code: "CU", name: 'Cuba', flag: "🇨🇺", currency: "CUP", symbol: '₱', jurisdiction: "Cuba national law" },
  { code: "CY", name: 'Cyprus', flag: "🇨🇾", currency: "EUR", symbol: '€', jurisdiction: "Cyprus national law" },
  { code: "CZ", name: 'Czech Republic', flag: "🇨🇿", currency: "CZK", symbol: 'Kč', jurisdiction: "Czech Republic national law" },
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", currency: "XOF", symbol: 'CFA', jurisdiction: "Côte d'Ivoire national law" },
  { code: "DK", name: 'Denmark', flag: "🇩🇰", currency: "DKK", symbol: 'kr', jurisdiction: "Denmark national law" },
  { code: "DJ", name: 'Djibouti', flag: "🇩🇯", currency: "DJF", symbol: 'Fdj', jurisdiction: "Djibouti national law" },
  { code: "DM", name: 'Dominica', flag: "🇩🇲", currency: "XCD", symbol: 'EC$', jurisdiction: "Dominica national law" },
  { code: "DO", name: 'Dominican Republic', flag: "🇩🇴", currency: "DOP", symbol: 'RD$', jurisdiction: "Dominican Republic national law" },
  { code: "EC", name: 'Ecuador', flag: "🇪🇨", currency: "USD", symbol: '$', jurisdiction: "Ecuador national law" },
  { code: "EG", name: 'Egypt', flag: "🇪🇬", currency: "EGP", symbol: 'E£', jurisdiction: "Egypt national law" },
  { code: "SV", name: 'El Salvador', flag: "🇸🇻", currency: "USD", symbol: '$', jurisdiction: "El Salvador national law" },
  { code: "GQ", name: 'Equatorial Guinea', flag: "🇬🇶", currency: "XAF", symbol: 'FCFA', jurisdiction: "Equatorial Guinea national law" },
  { code: "ER", name: 'Eritrea', flag: "🇪🇷", currency: "ERN", symbol: 'Nfk', jurisdiction: "Eritrea national law" },
  { code: "EE", name: 'Estonia', flag: "🇪🇪", currency: "EUR", symbol: '€', jurisdiction: "Estonia national law" },
  { code: "SZ", name: 'Eswatini', flag: "🇸🇿", currency: "SZL", symbol: 'E', jurisdiction: "Eswatini national law" },
  { code: "ET", name: 'Ethiopia', flag: "🇪🇹", currency: "ETB", symbol: 'Br', jurisdiction: "Ethiopia national law" },
  { code: "FJ", name: 'Fiji', flag: "🇫🇯", currency: "FJD", symbol: 'FJ$', jurisdiction: "Fiji national law" },
  { code: "FI", name: 'Finland', flag: "🇫🇮", currency: "EUR", symbol: '€', jurisdiction: "Finland national law" },
  { code: "FR", name: 'France', flag: "🇫🇷", currency: "EUR", symbol: '€', jurisdiction: "France national law" },
  { code: "GA", name: 'Gabon', flag: "🇬🇦", currency: "XAF", symbol: 'FCFA', jurisdiction: "Gabon national law" },
  { code: "GM", name: 'Gambia', flag: "🇬🇲", currency: "GMD", symbol: 'D', jurisdiction: "Gambia national law" },
  { code: "GE", name: 'Georgia', flag: "🇬🇪", currency: "GEL", symbol: '₾', jurisdiction: "Georgia national law" },
  { code: "DE", name: 'Germany', flag: "🇩🇪", currency: "EUR", symbol: '€', jurisdiction: "Germany national law" },
  { code: "GH", name: 'Ghana', flag: "🇬🇭", currency: "GHS", symbol: 'GH₵', jurisdiction: "Ghana national law" },
  { code: "GR", name: 'Greece', flag: "🇬🇷", currency: "EUR", symbol: '€', jurisdiction: "Greece national law" },
  { code: "GD", name: 'Grenada', flag: "🇬🇩", currency: "XCD", symbol: 'EC$', jurisdiction: "Grenada national law" },
  { code: "GT", name: 'Guatemala', flag: "🇬🇹", currency: "GTQ", symbol: 'Q', jurisdiction: "Guatemala national law" },
  { code: "GN", name: 'Guinea', flag: "🇬🇳", currency: "GNF", symbol: 'FG', jurisdiction: "Guinea national law" },
  { code: "GW", name: 'Guinea-Bissau', flag: "🇬🇼", currency: "XOF", symbol: 'CFA', jurisdiction: "Guinea-Bissau national law" },
  { code: "GY", name: 'Guyana', flag: "🇬🇾", currency: "GYD", symbol: 'GY$', jurisdiction: "Guyana national law" },
  { code: "HT", name: 'Haiti', flag: "🇭🇹", currency: "HTG", symbol: 'G', jurisdiction: "Haiti national law" },
  { code: "HN", name: 'Honduras', flag: "🇭🇳", currency: "HNL", symbol: 'L', jurisdiction: "Honduras national law" },
  { code: "HK", name: 'Hong Kong', flag: "🇭🇰", currency: "HKD", symbol: 'HK$', jurisdiction: "Hong Kong national law" },
  { code: "HU", name: 'Hungary', flag: "🇭🇺", currency: "HUF", symbol: 'Ft', jurisdiction: "Hungary national law" },
  { code: "IS", name: 'Iceland', flag: "🇮🇸", currency: "ISK", symbol: 'kr', jurisdiction: "Iceland national law" },
  { code: "IN", name: 'India', flag: "🇮🇳", currency: "INR", symbol: '₹', jurisdiction: "India national law" },
  { code: "ID", name: 'Indonesia', flag: "🇮🇩", currency: "IDR", symbol: 'Rp', jurisdiction: "Indonesia national law" },
  { code: "IR", name: 'Iran', flag: "🇮🇷", currency: "IRR", symbol: '﷼', jurisdiction: "Iran national law" },
  { code: "IQ", name: 'Iraq', flag: "🇮🇶", currency: "IQD", symbol: 'ع.د', jurisdiction: "Iraq national law" },
  { code: "IE", name: 'Ireland', flag: "🇮🇪", currency: "EUR", symbol: '€', jurisdiction: "Ireland national law" },
  { code: "IL", name: 'Israel', flag: "🇮🇱", currency: "ILS", symbol: '₪', jurisdiction: "Israel national law" },
  { code: "IT", name: 'Italy', flag: "🇮🇹", currency: "EUR", symbol: '€', jurisdiction: "Italy national law" },
  { code: "JM", name: 'Jamaica', flag: "🇯🇲", currency: "JMD", symbol: 'J$', jurisdiction: "Jamaica national law" },
  { code: "JP", name: 'Japan', flag: "🇯🇵", currency: "JPY", symbol: '¥', jurisdiction: "Japan national law" },
  { code: "JO", name: 'Jordan', flag: "🇯🇴", currency: "JOD", symbol: 'JD', jurisdiction: "Jordan national law" },
  { code: "KZ", name: 'Kazakhstan', flag: "🇰🇿", currency: "KZT", symbol: '₸', jurisdiction: "Kazakhstan national law" },
  { code: "KE", name: 'Kenya', flag: "🇰🇪", currency: "KES", symbol: 'KSh', jurisdiction: "Kenya national law" },
  { code: "KI", name: 'Kiribati', flag: "🇰🇮", currency: "AUD", symbol: 'A$', jurisdiction: "Kiribati national law" },
  { code: "KW", name: 'Kuwait', flag: "🇰🇼", currency: "KWD", symbol: 'KD', jurisdiction: "Kuwait national law" },
  { code: "KG", name: 'Kyrgyzstan', flag: "🇰🇬", currency: "KGS", symbol: 'с', jurisdiction: "Kyrgyzstan national law" },
  { code: "LA", name: 'Laos', flag: "🇱🇦", currency: "LAK", symbol: '₭', jurisdiction: "Laos national law" },
  { code: "LV", name: 'Latvia', flag: "🇱🇻", currency: "EUR", symbol: '€', jurisdiction: "Latvia national law" },
  { code: "LB", name: 'Lebanon', flag: "🇱🇧", currency: "LBP", symbol: 'ل.ل', jurisdiction: "Lebanon national law" },
  { code: "LS", name: 'Lesotho', flag: "🇱🇸", currency: "LSL", symbol: 'L', jurisdiction: "Lesotho national law" },
  { code: "LR", name: 'Liberia', flag: "🇱🇷", currency: "LRD", symbol: 'L$', jurisdiction: "Liberia national law" },
  { code: "LY", name: 'Libya', flag: "🇱🇾", currency: "LYD", symbol: 'LD', jurisdiction: "Libya national law" },
  { code: "LI", name: 'Liechtenstein', flag: "🇱🇮", currency: "CHF", symbol: 'CHF', jurisdiction: "Liechtenstein national law" },
  { code: "LT", name: 'Lithuania', flag: "🇱🇹", currency: "EUR", symbol: '€', jurisdiction: "Lithuania national law" },
  { code: "LU", name: 'Luxembourg', flag: "🇱🇺", currency: "EUR", symbol: '€', jurisdiction: "Luxembourg national law" },
  { code: "MO", name: 'Macao', flag: "🇲🇴", currency: "MOP", symbol: 'MOP$', jurisdiction: "Macao national law" },
  { code: "MG", name: 'Madagascar', flag: "🇲🇬", currency: "MGA", symbol: 'Ar', jurisdiction: "Madagascar national law" },
  { code: "MW", name: 'Malawi', flag: "🇲🇼", currency: "MWK", symbol: 'MK', jurisdiction: "Malawi national law" },
  { code: "MY", name: 'Malaysia', flag: "🇲🇾", currency: "MYR", symbol: 'RM', jurisdiction: "Malaysia national law" },
  { code: "MV", name: 'Maldives', flag: "🇲🇻", currency: "MVR", symbol: 'Rf', jurisdiction: "Maldives national law" },
  { code: "ML", name: 'Mali', flag: "🇲🇱", currency: "XOF", symbol: 'CFA', jurisdiction: "Mali national law" },
  { code: "MT", name: 'Malta', flag: "🇲🇹", currency: "EUR", symbol: '€', jurisdiction: "Malta national law" },
  { code: "MH", name: 'Marshall Islands', flag: "🇲🇭", currency: "USD", symbol: '$', jurisdiction: "Marshall Islands national law" },
  { code: "MR", name: 'Mauritania', flag: "🇲🇷", currency: "MRU", symbol: 'UM', jurisdiction: "Mauritania national law" },
  { code: "MU", name: 'Mauritius', flag: "🇲🇺", currency: "MUR", symbol: 'Rs', jurisdiction: "Mauritius national law" },
  { code: "MX", name: 'Mexico', flag: "🇲🇽", currency: "MXN", symbol: 'Mex$', jurisdiction: "Mexico national law" },
  { code: "FM", name: 'Micronesia', flag: "🇫🇲", currency: "USD", symbol: '$', jurisdiction: "Micronesia national law" },
  { code: "MD", name: 'Moldova', flag: "🇲🇩", currency: "MDL", symbol: 'L', jurisdiction: "Moldova national law" },
  { code: "MC", name: 'Monaco', flag: "🇲🇨", currency: "EUR", symbol: '€', jurisdiction: "Monaco national law" },
  { code: "MN", name: 'Mongolia', flag: "🇲🇳", currency: "MNT", symbol: '₮', jurisdiction: "Mongolia national law" },
  { code: "ME", name: 'Montenegro', flag: "🇲🇪", currency: "EUR", symbol: '€', jurisdiction: "Montenegro national law" },
  { code: "MA", name: 'Morocco', flag: "🇲🇦", currency: "MAD", symbol: 'د.م.', jurisdiction: "Morocco national law" },
  { code: "MZ", name: 'Mozambique', flag: "🇲🇿", currency: "MZN", symbol: 'MT', jurisdiction: "Mozambique national law" },
  { code: "MM", name: 'Myanmar', flag: "🇲🇲", currency: "MMK", symbol: 'K', jurisdiction: "Myanmar national law" },
  { code: "NA", name: 'Namibia', flag: "🇳🇦", currency: "NAD", symbol: 'N$', jurisdiction: "Namibia national law" },
  { code: "NR", name: 'Nauru', flag: "🇳🇷", currency: "AUD", symbol: 'A$', jurisdiction: "Nauru national law" },
  { code: "NP", name: 'Nepal', flag: "🇳🇵", currency: "NPR", symbol: 'रू', jurisdiction: "Nepal national law" },
  { code: "NL", name: 'Netherlands', flag: "🇳🇱", currency: "EUR", symbol: '€', jurisdiction: "Netherlands national law" },
  { code: "NZ", name: 'New Zealand', flag: "🇳🇿", currency: "NZD", symbol: 'NZ$', jurisdiction: "New Zealand national law" },
  { code: "NI", name: 'Nicaragua', flag: "🇳🇮", currency: "NIO", symbol: 'C$', jurisdiction: "Nicaragua national law" },
  { code: "NE", name: 'Niger', flag: "🇳🇪", currency: "XOF", symbol: 'CFA', jurisdiction: "Niger national law" },
  { code: "NG", name: 'Nigeria', flag: "🇳🇬", currency: "NGN", symbol: '₦', jurisdiction: "Nigeria national law" },
  { code: "KP", name: 'North Korea', flag: "🇰🇵", currency: "KPW", symbol: '₩', jurisdiction: "North Korea national law" },
  { code: "MK", name: 'North Macedonia', flag: "🇲🇰", currency: "MKD", symbol: 'ден', jurisdiction: "North Macedonia national law" },
  { code: "NO", name: 'Norway', flag: "🇳🇴", currency: "NOK", symbol: 'kr', jurisdiction: "Norway national law" },
  { code: "OM", name: 'Oman', flag: "🇴🇲", currency: "OMR", symbol: 'ر.ع.', jurisdiction: "Oman national law" },
  { code: "PK", name: 'Pakistan', flag: "🇵🇰", currency: "PKR", symbol: 'Rs', jurisdiction: "Pakistan national law" },
  { code: "PW", name: 'Palau', flag: "🇵🇼", currency: "USD", symbol: '$', jurisdiction: "Palau national law" },
  { code: "PS", name: 'Palestine', flag: "🇵🇸", currency: "ILS", symbol: '₪', jurisdiction: "Palestine national law" },
  { code: "PA", name: 'Panama', flag: "🇵🇦", currency: "PAB", symbol: 'B/.', jurisdiction: "Panama national law" },
  { code: "PG", name: 'Papua New Guinea', flag: "🇵🇬", currency: "PGK", symbol: 'K', jurisdiction: "Papua New Guinea national law" },
  { code: "PY", name: 'Paraguay', flag: "🇵🇾", currency: "PYG", symbol: '₲', jurisdiction: "Paraguay national law" },
  { code: "PE", name: 'Peru', flag: "🇵🇪", currency: "PEN", symbol: 'S/', jurisdiction: "Peru national law" },
  { code: "PH", name: 'Philippines', flag: "🇵🇭", currency: "PHP", symbol: '₱', jurisdiction: "Philippines national law" },
  { code: "PL", name: 'Poland', flag: "🇵🇱", currency: "PLN", symbol: 'zł', jurisdiction: "Poland national law" },
  { code: "PT", name: 'Portugal', flag: "🇵🇹", currency: "EUR", symbol: '€', jurisdiction: "Portugal national law" },
  { code: "QA", name: 'Qatar', flag: "🇶🇦", currency: "QAR", symbol: 'ر.ق', jurisdiction: "Qatar national law" },
  { code: "RO", name: 'Romania', flag: "🇷🇴", currency: "RON", symbol: 'lei', jurisdiction: "Romania national law" },
  { code: "RU", name: 'Russia', flag: "🇷🇺", currency: "RUB", symbol: '₽', jurisdiction: "Russia national law" },
  { code: "RW", name: 'Rwanda', flag: "🇷🇼", currency: "RWF", symbol: 'FRw', jurisdiction: "Rwanda national law" },
  { code: "KN", name: 'Saint Kitts and Nevis', flag: "🇰🇳", currency: "XCD", symbol: 'EC$', jurisdiction: "Saint Kitts and Nevis national law" },
  { code: "LC", name: 'Saint Lucia', flag: "🇱🇨", currency: "XCD", symbol: 'EC$', jurisdiction: "Saint Lucia national law" },
  { code: "VC", name: 'Saint Vincent', flag: "🇻🇨", currency: "XCD", symbol: 'EC$', jurisdiction: "Saint Vincent national law" },
  { code: "WS", name: 'Samoa', flag: "🇼🇸", currency: "WST", symbol: 'T', jurisdiction: "Samoa national law" },
  { code: "SM", name: 'San Marino', flag: "🇸🇲", currency: "EUR", symbol: '€', jurisdiction: "San Marino national law" },
  { code: "SA", name: 'Saudi Arabia', flag: "🇸🇦", currency: "SAR", symbol: 'ر.س', jurisdiction: "Saudi Arabia national law" },
  { code: "SN", name: 'Senegal', flag: "🇸🇳", currency: "XOF", symbol: 'CFA', jurisdiction: "Senegal national law" },
  { code: "RS", name: 'Serbia', flag: "🇷🇸", currency: "RSD", symbol: 'дин', jurisdiction: "Serbia national law" },
  { code: "SC", name: 'Seychelles', flag: "🇸🇨", currency: "SCR", symbol: 'SR', jurisdiction: "Seychelles national law" },
  { code: "SL", name: 'Sierra Leone', flag: "🇸🇱", currency: "SLL", symbol: 'Le', jurisdiction: "Sierra Leone national law" },
  { code: "SG", name: 'Singapore', flag: "🇸🇬", currency: "SGD", symbol: 'S$', jurisdiction: "Singapore national law" },
  { code: "SK", name: 'Slovakia', flag: "🇸🇰", currency: "EUR", symbol: '€', jurisdiction: "Slovakia national law" },
  { code: "SI", name: 'Slovenia', flag: "🇸🇮", currency: "EUR", symbol: '€', jurisdiction: "Slovenia national law" },
  { code: "SB", name: 'Solomon Islands', flag: "🇸🇧", currency: "SBD", symbol: 'SI$', jurisdiction: "Solomon Islands national law" },
  { code: "SO", name: 'Somalia', flag: "🇸🇴", currency: "SOS", symbol: 'Sh', jurisdiction: "Somalia national law" },
  { code: "ZA", name: 'South Africa', flag: "🇿🇦", currency: "ZAR", symbol: 'R', jurisdiction: "South Africa national law" },
  { code: "KR", name: 'South Korea', flag: "🇰🇷", currency: "KRW", symbol: '₩', jurisdiction: "South Korea national law" },
  { code: "SS", name: 'South Sudan', flag: "🇸🇸", currency: "SSP", symbol: 'SSP', jurisdiction: "South Sudan national law" },
  { code: "ES", name: 'Spain', flag: "🇪🇸", currency: "EUR", symbol: '€', jurisdiction: "Spain national law" },
  { code: "LK", name: 'Sri Lanka', flag: "🇱🇰", currency: "LKR", symbol: 'Rs', jurisdiction: "Sri Lanka national law" },
  { code: "SD", name: 'Sudan', flag: "🇸🇩", currency: "SDG", symbol: 'ج.س.', jurisdiction: "Sudan national law" },
  { code: "SR", name: 'Suriname', flag: "🇸🇷", currency: "SRD", symbol: '$', jurisdiction: "Suriname national law" },
  { code: "SE", name: 'Sweden', flag: "🇸🇪", currency: "SEK", symbol: 'kr', jurisdiction: "Sweden national law" },
  { code: "CH", name: 'Switzerland', flag: "🇨🇭", currency: "CHF", symbol: 'CHF', jurisdiction: "Switzerland national law" },
  { code: "SY", name: 'Syria', flag: "🇸🇾", currency: "SYP", symbol: '£', jurisdiction: "Syria national law" },
  { code: "ST", name: 'São Tomé and Príncipe', flag: "🇸🇹", currency: "STN", symbol: 'Db', jurisdiction: "São Tomé and Príncipe national law" },
  { code: "TW", name: 'Taiwan', flag: "🇹🇼", currency: "TWD", symbol: 'NT$', jurisdiction: "Taiwan national law" },
  { code: "TJ", name: 'Tajikistan', flag: "🇹🇯", currency: "TJS", symbol: 'SM', jurisdiction: "Tajikistan national law" },
  { code: "TZ", name: 'Tanzania', flag: "🇹🇿", currency: "TZS", symbol: 'TSh', jurisdiction: "Tanzania national law" },
  { code: "TH", name: 'Thailand', flag: "🇹🇭", currency: "THB", symbol: '฿', jurisdiction: "Thailand national law" },
  { code: "TL", name: 'Timor-Leste', flag: "🇹🇱", currency: "USD", symbol: '$', jurisdiction: "Timor-Leste national law" },
  { code: "TG", name: 'Togo', flag: "🇹🇬", currency: "XOF", symbol: 'CFA', jurisdiction: "Togo national law" },
  { code: "TO", name: 'Tonga', flag: "🇹🇴", currency: "TOP", symbol: 'T$', jurisdiction: "Tonga national law" },
  { code: "TT", name: 'Trinidad and Tobago', flag: "🇹🇹", currency: "TTD", symbol: 'TT$', jurisdiction: "Trinidad and Tobago national law" },
  { code: "TN", name: 'Tunisia', flag: "🇹🇳", currency: "TND", symbol: 'د.ت', jurisdiction: "Tunisia national law" },
  { code: "TR", name: 'Turkey', flag: "🇹🇷", currency: "TRY", symbol: '₺', jurisdiction: "Turkey national law" },
  { code: "TM", name: 'Turkmenistan', flag: "🇹🇲", currency: "TMT", symbol: 'T', jurisdiction: "Turkmenistan national law" },
  { code: "TV", name: 'Tuvalu', flag: "🇹🇻", currency: "AUD", symbol: 'A$', jurisdiction: "Tuvalu national law" },
  { code: "UG", name: 'Uganda', flag: "🇺🇬", currency: "UGX", symbol: 'USh', jurisdiction: "Uganda national law" },
  { code: "UA", name: 'Ukraine', flag: "🇺🇦", currency: "UAH", symbol: '₴', jurisdiction: "Ukraine national law" },
  { code: "AE", name: 'United Arab Emirates', flag: "🇦🇪", currency: "AED", symbol: 'د.إ', jurisdiction: "United Arab Emirates national law" },
  { code: "GB", name: 'United Kingdom', flag: "🇬🇧", currency: "GBP", symbol: '£', jurisdiction: "United Kingdom national law" },
  { code: "US", name: 'United States', flag: "🇺🇸", currency: "USD", symbol: '$', jurisdiction: "United States national law" },
  { code: "UY", name: 'Uruguay', flag: "🇺🇾", currency: "UYU", symbol: '$U', jurisdiction: "Uruguay national law" },
  { code: "UZ", name: 'Uzbekistan', flag: "🇺🇿", currency: "UZS", symbol: 'лв', jurisdiction: "Uzbekistan national law" },
  { code: "VU", name: 'Vanuatu', flag: "🇻🇺", currency: "VUV", symbol: 'VT', jurisdiction: "Vanuatu national law" },
  { code: "VA", name: 'Vatican City', flag: "🇻🇦", currency: "EUR", symbol: '€', jurisdiction: "Vatican City national law" },
  { code: "VE", name: 'Venezuela', flag: "🇻🇪", currency: "VES", symbol: 'Bs', jurisdiction: "Venezuela national law" },
  { code: "VN", name: 'Vietnam', flag: "🇻🇳", currency: "VND", symbol: '₫', jurisdiction: "Vietnam national law" },
  { code: "YE", name: 'Yemen', flag: "🇾🇪", currency: "YER", symbol: '﷼', jurisdiction: "Yemen national law" },
  { code: "ZM", name: 'Zambia', flag: "🇿🇲", currency: "ZMW", symbol: 'ZK', jurisdiction: "Zambia national law" },
  { code: "ZW", name: 'Zimbabwe', flag: "🇿🇼", currency: "ZWL", symbol: 'Z$', jurisdiction: "Zimbabwe national law" },
];

export const COUNTRIES: CountryOption[] = _RAW_COUNTRIES.map((c) => ({
  ...c,
  jurisdiction: JURISDICTION_OVERRIDES[c.code] || `the national laws of ${c.name}`,
}));

const STORAGE_KEY = "plos.country_override";

function inferFromAddress(address?: string): string {
  if (!address) return "US";
  const a = address.toLowerCase();
  for (const c of COUNTRIES) {
    if (a.includes(c.name.toLowerCase())) return c.code;
  }
  if (a.includes(" ga ") || a.includes("georgia")) return "US";
  return "US";
}

export function findCountry(code: string): CountryOption {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES.find((c) => c.code === "US")!;
}

// -----------------------------------------------------------------------------
// Shared subscribable store — every useCountry() consumer sees the same value.
// -----------------------------------------------------------------------------
type Listener = (code: string) => void;

let _current: string = "US";
let _initialized = false;
const _listeners = new Set<Listener>();

async function _hydrateOnce() {
  if (_initialized) return;
  _initialized = true;
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) {
      _current = saved;
      _listeners.forEach((l) => l(saved));
    }
  } catch (_e) {}
}

function _setCountry(code: string) {
  _current = code;
  _listeners.forEach((l) => l(code));
  AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
}

function _subscribe(l: Listener): () => void {
  _listeners.add(l);
  return () => { _listeners.delete(l); };
}

export function useCountry(homeAddress?: string) {
  const seed = _initialized ? _current : inferFromAddress(homeAddress);
  const [countryCode, setCountryCode] = useState<string>(seed);
  const [loading, setLoading] = useState(!_initialized);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await _hydrateOnce();
      if (mounted) {
        setCountryCode(_current);
        setLoading(false);
      }
    })();
    const unsub = _subscribe((code) => { if (mounted) setCountryCode(code); });
    return () => { mounted = false; unsub(); };
  }, []);

  const changeCountry = useCallback(async (code: string) => {
    _setCountry(code);
  }, []);

  return { country: findCountry(countryCode), countryCode, changeCountry, loading };
}
